// 抹平主进程 (process.env) 和 渲染进程 (import.meta.env) 的读取差异
export const getEnv = (key: string) => {
    if (typeof process !== 'undefined' && process.env) {
        return process.env[key];
    }
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env) {
        // @ts-ignore
        return import.meta.env[key];
    }
    return undefined;
};

export const LOCAL_CACHE_SCHEME = 'localcache';

export const Main_Config = {
    get wsConfig() {
        return {
            url: getEnv('VITE_WS_SERVER') || 'ws://localhost:8022/ws',
            reconnectIntervalMs: 1000,
            maxReconnectIntervalMs: 30000,
            heartbeatIntervalMs: 30000,
            heartbeatTimeoutMs: 10000,
        };
    },

    FileCacheManagerConfig: {
        maxWidth: 280,
        quality: 85,
    },

    windowConfig: {
        showTimeoutMs: 5000,
    },

    messageQueue: {
        dedupWindowMs: 5 * 60 * 1000, // 消息去重时间
        dedupMaxEntries: 10000, // 去重缓存条目上限（LRU 淘汰）
        maxRetries: 2, // 最大重试次数
        checkIntervalMs: 1000, // 检查间隔
        msgTimeoutMs: 30000, // 消息超时时间
    },

    /** 缓存过期时间（毫秒），默认 3 天 */
    cacheExpirationMs: 3 * 24 * 60 * 60 * 1000,

    /** 每个类型的资源最大缓存数量 */
    maxCacheItems: 5000,
};

export const Renderer_Config = {
    /** WS消息版本 */
    get wsMessageVersion() { return getEnv('VITE_WS_VERSION') },

    maxSessionListCount: 40,

    imageCompressQuality: 80,
};

// 存放主进程和渲染进程通用的不变常量
export const APP_CONSTANTS = {
    ApplicationName: 'Nexus',
    /** Auth 服务器地址 */
    get authServer() { return getEnv('VITE_AUTH_SERVER') || 'http://localhost:8022'; },

    /** User 服务器地址 */
    get userServer() { return getEnv('VITE_USER_SERVER') || 'http://localhost:8021'; },

    /** Group 服务器地址 */
    get groupServer() { return getEnv('VITE_GROUP_SERVER') || 'http://localhost:8022'; },

    /** Message 服务器地址 */
    get messageServer() { return getEnv('VITE_MESSAGE_SERVER') || 'http://localhost:8024'; },

    /** File 服务器地址 */
    get fileServer() { return getEnv('VITE_FILE_SERVER') || 'http://localhost:8023'; },

    /** 最大图片宽度 */
    maxImageWidth: 280,
    maxImageHeight: 380,

    /** 图片压缩质量 */
    imageCompressQuality: 85,

    /** 下载取消错误信息 */
    ERR_DOWNLOAD_CANCELLED: 'Download cancelled by user',
};
