/**
 * 主进程统一配置
 * 集中管理所有 server URL 和常量，避免各文件分散定义
 */

export const config = {
    /** Auth 服务器地址 */
    authServer: process.env.VITE_AUTH_SERVER || 'http://localhost:8022',

    /** User 服务器地址 */
    userServer: process.env.VITE_USER_SERVER || 'http://localhost:8021',

    /** Group 服务器地址 */
    groupServer: process.env.VITE_GROUP_SERVER || 'http://localhost:8022',

    wsConfig: {
        url: process.env.VITE_WS_SERVER || 'ws://localhost:8022/ws',
        reconnectIntervalMs: 1000,
        maxReconnectIntervalMs: 30000,
        heartbeatIntervalMs: 30000,
        heartbeatTimeoutMs: 10000,

    },

    windowConfig: {
        showTimeoutMs: 5000,
    },

    messageQueue: {
        dedupWindowMs: 5 * 60 * 1000, // 消息去重时间
        maxRetries: 3, // 最大重试次数
        checkIntervalMs: 1000, // 检查间隔
        msgTimeoutMs: 10000, // 消息超时时间
    },

    /** 缓存过期时间（毫秒），默认 3 天 */
    cacheExpirationMs: 3 * 24 * 60 * 60 * 1000,

    /** 每个类型的资源最大缓存数量 */
    maxCacheItems: 5000,
};
