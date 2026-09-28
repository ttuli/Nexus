import WebSocket from 'ws';

import { EventEmitter } from 'events';
import { WsMessage, IMessageSerializer } from './serializer/MessageSerializer';
import { messageQueue } from './MessageQueue';
import { messageRouter } from './MessageRouter';
import { setupRoutes } from './routes';
import { tokenManager } from '@/electron/resource/tokenManager';
import { ImTypes, LogoutType, IpcChannels, ConnectionState } from '@shared/types';
import { windowManager } from '@/electron/windows/windowManager';
import { Main_Config } from '@shared/config/constants';
import { defaultSerializer } from './serializer/protoSerializer';

/**
 * WebSocket Manager Configuration
 */
interface WsManagerConfig {
    url?: string;
    reconnectIntervalMs?: number;
    maxReconnectIntervalMs?: number;
    heartbeatIntervalMs?: number;
    heartbeatTimeoutMs?: number;
    serializer?: IMessageSerializer;
    msgTimeoutMs?: number, // 消息超时时间
}

/**
 * RFC 6455 关闭码 1012 Service Restart：服务端计划内重启。
 * 网关节点在关停（滚动更新/缩容）时会带这个码下发 Close 帧，
 * 用于和网络故障导致的异常断开（1006）区分开。
 */
const WS_CLOSE_SERVICE_RESTART = 1012;

const DEFAULT_CONFIG: Required<WsManagerConfig> = {
    url: '',
    reconnectIntervalMs: 1000,
    maxReconnectIntervalMs: 30000,
    heartbeatIntervalMs: 30000,
    heartbeatTimeoutMs: 10000,
    serializer: defaultSerializer,
    msgTimeoutMs: 10000,
};

/**
 * WebSocket Manager
 * Handles connection, reconnection, heartbeat, and message routing
 */
export class WebSocketManager extends EventEmitter {
    private ws: WebSocket | null = null;
    private config: Required<WsManagerConfig>;
    // 构造时传入的实例级配置，优先级高于全局 Main_Config.wsConfig（init 时合并）
    private readonly instanceConfig: WsManagerConfig;
    private state: ConnectionState = ConnectionState.DISCONNECTED;
    private reconnectAttempts: number = 0;
    private reconnectTimer: NodeJS.Timeout | null = null;
    private heartbeatTimer: NodeJS.Timeout | null = null;
    private heartbeatTimeoutTimer: NodeJS.Timeout | null = null;
    private initialized: boolean = false;
    private isRecovering401: boolean = false;
    private isManualClose: boolean = false;

    constructor(config: WsManagerConfig = {}) {
        super();
        this.instanceConfig = config;
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Initialize the WebSocket manager
     */
    init(): void {
        if (this.initialized) return;
        this.initialized = true;

        // Setup message routes
        setupRoutes();

        // Setup queue listeners
        this.setupQueueListeners();

        // 合并顺序：默认值 < 全局配置 < 构造时传入的实例配置（显式 undefined 不参与覆盖）
        const overrides = Object.fromEntries(
            Object.entries(this.instanceConfig).filter(([, v]) => v !== undefined)
        );
        this.config = { ...DEFAULT_CONFIG, ...Main_Config.wsConfig, ...overrides };

        console.log('[WebSocketManager] Initialized');
    }

    /**
     * Connect to WebSocket server
     */
    connect(): void {
        if (!this.config.url) {
            console.error('[WebSocketManager] No URL configured');
            return;
        }

        this.isManualClose = false;

        if (this.state === ConnectionState.CONNECTED || this.state === ConnectionState.CONNECTING) {
            console.warn('[WebSocketManager] Already connected or connecting');
            return;
        }

        this.setState(ConnectionState.CONNECTING);

        try {
            // Get auth token
            const token = tokenManager.getToken();

            // Parse URL and add parameters
            const wsUrl = new URL(this.config.url);

            // Connect with auth header
            this.ws = new WebSocket(wsUrl.toString(), {
                headers: {
                    'Authorization': token ? `Bearer ${token}` : '',
                },
                skipUTF8Validation: true,
            });

            this.setupEventHandlers();
        } catch (error) {
            console.error('[WebSocketManager] Connection error:', error);
            this.scheduleReconnect();
        }
    }


    /**
     * Send a message
     */
    send(message: WsMessage): boolean {
        messageQueue.enqueue(message);

        if (this.state !== ConnectionState.CONNECTED || !this.ws) {
            console.log('[WebSocketManager] Message queued (offline):', message.clientId);
            return true;
        }

        this.flushQueue();
        return true;
    }

    /**
     * 发送通话信令：绕开 MessageQueue，不排队、不重试、不补投。
     *
     * 信令是易失的——离线时排队、重连后补发一条过期的 offer / ICE candidate
     * 只会让对端困惑，通话早已由服务端 sweeper 收敛。断连即失败，让上层直接反馈用户。
     *
     * 另：MessageQueue.enqueue 对无 clientId 的帧直接 return，
     * 而 send() 只发队列里的内容，信令走 send() 会被静默丢弃，必须走本方法。
     */
    sendSignal(message: ImTypes.WSMessage): boolean {
        if (this.state !== ConnectionState.CONNECTED || !this.ws) {
            console.warn('[WebSocketManager] Signal dropped (offline):', message.type);
            return false;
        }
        try {
            // 信令没有 clientId（不需要 ACK/去重），序列化只走 proto encode 不读该字段
            this.sendDirect(message as WsMessage);
            return true;
        } catch (error) {
            console.error('[WebSocketManager] Signal send error:', error);
            return false;
        }
    }

    /**
     * Send a message directly without queue management (for retries)
     */
    private sendDirect(message: WsMessage): void {
        if (!this.ws || this.state !== ConnectionState.CONNECTED) {
            throw new Error('WebSocket is not connected');
        }
        const data = this.config.serializer.serialize(message);
        this.ws.send(data);
    }

    /**
     * Flush all pending messages in the queue
     */
    private flushQueue(): void {
        if (this.state !== ConnectionState.CONNECTED || !this.ws) return;

        const pending = messageQueue.flushPending();
        if (pending.length === 0) return;

        console.log(`[WebSocketManager] Flushing ${pending.length} pending messages`);
        for (const item of pending) {
            try {
                this.sendDirect(item.msg);
                console.log('[WebSocketManager] Sent message from queue:', item.clientId);
            } catch (error) {
                console.error('[WebSocketManager] Send error from queue:', error);
                // Rollback unacknowledged state, put back to pending for retry/reconnect
                if (item.clientId) {
                    messageQueue.acknowledge(String(item.clientId));
                    messageQueue.enqueue(item.msg);
                }
            }
        }
    }

    /**
     * Get pending message count
     */
    getPendingCount(): number {
        return messageQueue.getPendingCount();
    }

    // ============= Private Methods =============

    private setupEventHandlers(): void {
        if (!this.ws) return;

        this.ws.on('open', () => {
            console.log('[WebSocketManager] Connected');
            this.setState(ConnectionState.CONNECTED);
            this.reconnectAttempts = 0;
            this.isRecovering401 = false;
            this.isManualClose = false;
            this.startHeartbeat();
            this.flushPendingMessages();
        });

        this.ws.on('message', (data: WebSocket.Data) => {
            this.handleMessage(data);
        });

        this.ws.on('close', (code: number, reason: Buffer) => {
            this.setState(ConnectionState.DISCONNECTED);
            console.log(`[WebSocketManager] Closed: ${code} - ${reason.toString()}`);
            // 1012 Service Restart：网关节点计划内下线（滚动更新/缩容）时主动下发。
            // 这类断开不是网络故障——集群里其他网关实例仍然可用，退避等待没有意义，
            // 因此重置退避计数，让下一次重连按基础间隔立即发起。
            // 未识别该码时会沿用上一轮的退避曲线，最坏情况下要空等到封顶间隔才重连。
            if (code === WS_CLOSE_SERVICE_RESTART) {
                this.reconnectAttempts = 0;
            }
            this.handleDisconnect();
        });

        this.ws.on('pong', () => {
            this.handlePong();
        });

        this.ws.on('error', (error: Error) => {
            // 必须监听 error 事件，否则 Node.js 会将其作为 uncaught exception 抛出导致主进程崩溃
            // 常见场景：断网时 DNS 解析失败（ENOTFOUND）、连接被拒绝（ECONNREFUSED）等
            console.error('[WebSocketManager] WebSocket error:', error.message);
            // 不主动触发重连，close 事件随后会触发 handleDisconnect → scheduleReconnect
        });

        this.ws.on('unexpected-response', (request, response) => {
            // 服务端错误响应的 HTTP 状态固定为 500，真实原因在 body 的 ApiResponse.code
            // 中（ERR_UNAUTHORIZED=token 失效需刷新，ERR_KICKED_OUT=被踢下线），
            // 因此必须先读完 body 再终止请求并分流处理
            const chunks: Buffer[] = [];
            let finalized = false;
            const finalize = () => {
                if (finalized) return;
                finalized = true;
                // 手动终止请求，防止劫持此事件后导致的底层对象内存泄漏
                request.abort();
                void this.handleUpgradeRejection(response.statusCode ?? 0, Buffer.concat(chunks));
            };
            response.on('data', (chunk: Buffer) => chunks.push(chunk));
            response.on('end', finalize);
            response.on('error', finalize);
        });
    }

    /**
     * 处理 WS 升级被拒：按业务错误码分流。
     * token 失效 → 刷新后重连（连续两次失败才判定身份失效）；被踢 → 通知下线；
     * 其他（网关真实 5xx 等）→ 走常规断线重连。
     */
    private async handleUpgradeRejection(statusCode: number, body: Buffer): Promise<void> {
        let bizCode = 0;
        if (body.length > 0) {
            try {
                bizCode = ImTypes.ApiResponse.decode(new Uint8Array(body)).code;
            } catch {
                try {
                    bizCode = Number(JSON.parse(body.toString('utf-8'))?.code) || 0;
                } catch { /* body 无法解析，按未知错误走断线重连 */ }
            }
        }
        console.error(`[WebSocketManager] Unexpected response: ${statusCode}, code: ${bizCode}`);

        if (bizCode === ImTypes.ErrorCode.ERR_KICKED_OUT) {
            this.closeWs();
            windowManager.broadcastMessage(IpcChannels.LOGOUT_REMIND, { type: LogoutType.KICKED });
            return;
        }

        if (statusCode === 401 || bizCode === ImTypes.ErrorCode.ERR_UNAUTHORIZED) {

            if (this.isRecovering401) {
                console.error('[WebSocketManager] Token refresh failed or still 401 after refresh');
                this.closeWs();
                windowManager.broadcastMessage(IpcChannels.LOGOUT_REMIND, { type: LogoutType.LOGOUT });
                return;
            }

            console.log('[WebSocketManager] Token expired, attempting refresh...');
            this.isRecovering401 = true;
            const result = await tokenManager.requestTokenRefresh();

            if (result.success) {
                console.log('[WebSocketManager] Token refresh success, reconnecting...');
                this.clearTimers();
                this.closeWs();
                this.setState(ConnectionState.DISCONNECTED);
                this.connect();
            } else {
                console.error('[WebSocketManager] Token refresh failed:', result.error);
                this.isRecovering401 = false;
                this.closeWs();
                // 版本过低由更新模块接管，发登出提醒会把更新窗口一并拆掉
                if (!result.upgradeRequired) {
                    windowManager.broadcastMessage(IpcChannels.LOGOUT_REMIND, { type: LogoutType.LOGOUT });
                }
            }
        } else {
            this.handleDisconnect();
        }
    }

    private handleMessage(data: WebSocket.Data): void {
        try {
            const raw = data instanceof ArrayBuffer
                ? new Uint8Array(data)
                : data instanceof Buffer
                    ? new Uint8Array(data)
                    : data;
            const message = this.config.serializer.deserialize(raw as string | ArrayBuffer | Uint8Array);
            // Dispatch to router
            messageRouter.dispatch(message);
        } catch (error) {
            console.error('[WebSocketManager] Message parse error:', error);
        }
    }

    private handleDisconnect(): void {
        this.clearTimers();
        this.setState(ConnectionState.DISCONNECTED);
        this.scheduleReconnect();
    }

    /**
     * 关闭并清理 WebSocket 实例
     */
    closeWs(): void {
        // clearTimers 和 isManualClose 必须在 null 检查之前执行，
        // 否则当 this.ws 为 null 时（重连计时器已触发、connect 已运行但还没建立连接），
        // 计时器不会被清、标志位不会被设，导致重连仍然发生。
        this.clearTimers();
        this.isManualClose = true;

        if (!this.ws) return;

        this.setState(ConnectionState.DISCONNECTED);
        this.reconnectAttempts = 0;

        // 先移除所有监听器，再补一个 noop error handler，
        // 防止底层孤儿 socket（尤其是 CONNECTING 状态）后续触发 error 事件时
        // 因无监听器而变成 uncaught exception 导致主进程崩溃。
        this.ws.removeAllListeners();
        this.ws.on('error', () => {});

        // 使用 terminate() 而非条件式 close()：
        // close() 仅对 OPEN 状态有效，CONNECTING 状态的 socket 不会被关闭，
        // 底层 DNS/TCP 会继续运行并最终触发 error/close 事件（孤儿 socket）。
        // terminate() 直接销毁底层 socket，不论当前状态。
        this.ws.terminate();
        this.ws = null;
    }

    private scheduleReconnect(): void {
        if (this.reconnectTimer) return;
        if (this.isManualClose) {
            console.log('[WebSocketManager] Intentional close, skipping reconnect');
            return;
        }

        this.setState(ConnectionState.RECONNECTING);

        // Exponential backoff
        const delay = Math.min(
            this.config.reconnectIntervalMs * Math.pow(2, this.reconnectAttempts),
            this.config.maxReconnectIntervalMs
        );

        console.log(`[WebSocketManager] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);

        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.reconnectAttempts++;
            this.connect();
        }, delay);
    }

    private startHeartbeat(): void {
        this.stopHeartbeat();

        this.heartbeatTimer = setInterval(() => {
            this.sendPing();
        }, this.config.heartbeatIntervalMs);
    }

    private setupQueueListeners(): void {
        // Listen for internal retries
        messageQueue.on('retry', (msg: WsMessage) => {
            console.log('[WebSocketManager] Retrying message (internal):', msg.clientId);
            if (this.state === ConnectionState.CONNECTED && this.ws) {
                try {
                    this.sendDirect(msg);
                } catch (error) {
                    console.error('[WebSocketManager] Retry send error:', error);
                }
            }
        });

        // Listen for failures
        messageQueue.on('fail', (data: ImTypes.MessageAck) => {
            console.warn('[WebSocketManager] Message failed (internal):', data.client_id);
            windowManager.broadcastMessage(IpcChannels.WS_MESSAGE_ACK, { ack: data, timestamp: Date.now() });
        });
    }

    private stopHeartbeat(): void {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
        if (this.heartbeatTimeoutTimer) {
            clearTimeout(this.heartbeatTimeoutTimer);
            this.heartbeatTimeoutTimer = null;
        }
    }

    private sendPing(): void {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.ping()

            // Set timeout for pong
            this.heartbeatTimeoutTimer = setTimeout(() => {
                console.warn('[WebSocketManager] Heartbeat timeout, reconnecting...');
                this.ws?.close();
            }, this.config.heartbeatTimeoutMs);
        }
    }

    private handlePong(): void {
        if (this.heartbeatTimeoutTimer) {
            clearTimeout(this.heartbeatTimeoutTimer);
            this.heartbeatTimeoutTimer = null;
        }
    }

    private flushPendingMessages(): void {
        this.flushQueue();
    }

    private clearTimers(): void {
        this.stopHeartbeat();
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    private setState(newState: ConnectionState): void {
        this.state = newState;
        this.emit('stateChange', newState);
    }
}

export const wsManager = new WebSocketManager();
