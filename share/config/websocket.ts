import { getEnv } from './env';

/** WebSocket RFC 6455 关闭码常量 */
export const WS_CLOSE_CODE = {
    /**
     * 1012 Service Restart：服务端计划内重启（滚动更新/缩容）。
     * 网关节点关停时带此码下发 Close 帧，用于与异常断网（1006）区分，触发零退避重连。
     */
    SERVICE_RESTART: 1012,
} as const;

/** WebSocket 连接默认参数（不含动态 URL 与运行时序列化器） */
export const WS_DEFAULT_CONFIG = {
    reconnectIntervalMs: 1000,
    maxReconnectIntervalMs: 30000,
    heartbeatIntervalMs: 30000,
    heartbeatTimeoutMs: 10000,
} as const;

/** 读取包含服务端地址的完整 WebSocket 配置 */
export function getWsConfig() {
    return {
        url: getEnv('VITE_WS_SERVER') || 'ws://localhost:8022/ws',
        ...WS_DEFAULT_CONFIG,
    };
}

/** 离线队列、消息去重与 ACK 重试配置 */
export const MESSAGE_QUEUE_CONFIG = {
    /** 消息去重窗口（毫秒） */
    dedupWindowMs: 5 * 60 * 1000,
    /** 去重缓存条目上限（LRU 淘汰） */
    dedupMaxEntries: 10000,
    /** 发送超时后的最大重试次数 */
    maxRetries: 2,
    /** 超时巡检间隔（毫秒） */
    checkIntervalMs: 1000,
    /** 单条消息等待 ACK 的超时时间（毫秒） */
    msgTimeoutMs: 30000,
} as const;
