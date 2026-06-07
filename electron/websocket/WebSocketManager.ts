import WebSocket from 'ws';

import { EventEmitter } from 'events';
import { WsMessage, IMessageSerializer } from './serializer/MessageSerializer';
import { messageQueue } from './MessageQueue';
import { messageRouter } from './MessageRouter';
import { setupRoutes } from './routes';
import { tokenManager } from '../resource/tokenManager';
import { ImTypes, LogoutType, IpcChannels, ConnectionState } from '../../src/types';
import { windowManager } from '../windows/windowManager';
import { Main_Config as config } from '../../src/config/constants';
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

        // Get URL from config
        this.config = { ...DEFAULT_CONFIG, ...config.wsConfig };

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
        if (this.state !== ConnectionState.CONNECTED || !this.ws) {
            // Queue message for later
            messageQueue.enqueue(message);
            console.log('[WebSocketManager] Message queued (offline):', message.clientId);
            return true;
        }

        try {
            const data = this.config.serializer.serialize(message);
            messageQueue.enqueue(message);
            messageQueue.flushPending();

            this.ws.send(data);

            return true;
        } catch (error) {
            console.error('[WebSocketManager] Send error:', error);
            messageQueue.enqueue(message);
            return false;
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
            this.handleDisconnect();
        });

        this.ws.on('pong', () => {
            this.handlePong();
        });

        this.ws.on('unexpected-response', async (request, response) => {
            // 手动终止请求，防止劫持此事件后导致的底层对象内存泄漏
            request.abort();

            console.error(`[WebSocketManager] Unexpected response: ${response.statusCode}`);
            if (response.statusCode === 401) {

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
                    windowManager.broadcastMessage(IpcChannels.LOGOUT_REMIND, { type: LogoutType.LOGOUT });
                }
            } else {
                this.handleDisconnect();
            }
        });
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
        if (!this.ws) return;
        this.clearTimers();
        this.setState(ConnectionState.DISCONNECTED);
        this.reconnectAttempts = 0;
        this.isManualClose = true;
        this.ws.removeAllListeners();
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.close();
        }
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
            this.send(msg);
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
        const pending = messageQueue.flushPending();
        if (pending.length > 0) {
            console.log(`[WebSocketManager] Flushing ${pending.length} pending messages`);
            for (const item of pending) {
                this.send(item.msg);
            }
        }
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
