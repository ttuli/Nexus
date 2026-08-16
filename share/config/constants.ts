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

    /** 内存中保留消息列表缓存的会话数上限（LRU 淘汰） */
    maxCachedMessageSessions: 8,

    imageCompressQuality: 80,
};

/**
 * ICE 服务器配置项。
 * 不用 DOM 的 `RTCIceServer`：本文件同时被主进程加载，那边没有 DOM lib。
 * 结构与 `RTCIceServer` 兼容，使用处可直接赋值。
 */
export interface IceServerConfig {
    urls: string | string[];
    username?: string;
    credential?: string;
}

/** WebRTC 通话相关配置 */
export const CALL_CONFIG = {
    /**
     * ICE 服务器。
     *
     * **当前只有 STUN，双方都在对称 NAT 后面时通话建不起来** ——
     * TURN 部署是后端待办（见 IMChat/CALL_TODO.md §1）。
     *
     * 环境变量里的 TURN 凭证只是开发期兜底：生产必须由后端下发**短时凭证**
     * （HMAC 生成的临时用户名/密码），静态密码放在客户端等于公开。
     * 后端接口就绪后把本 getter 换成拉取结果即可，调用方无需改动。
     */
    get iceServers(): IceServerConfig[] {
        const servers: IceServerConfig[] = [
            { urls: getEnv('VITE_STUN_SERVER') || 'stun:stun.l.google.com:19302' },
        ];
        const turnUrl = getEnv('VITE_TURN_SERVER');
        if (turnUrl) {
            servers.push({
                urls: turnUrl,
                username: getEnv('VITE_TURN_USERNAME'),
                credential: getEnv('VITE_TURN_CREDENTIAL'),
            });
        }
        return servers;
    },

    /**
     * 视频通话窗口尺寸。
     * call 窗默认 400×600 是竖屏语音尺寸（windowAttribute.ts），视频会被挤变形，
     * 创建时用 CreateWindowRequest.windowSize 覆盖。
     */
    videoWindowSize: { width: 800, height: 600 },

    /** 通话结束后停留多久再关窗，留时间让用户看清结束原因 */
    endedCloseDelayMs: 1200,

    /** 铃声资源（public/ 下，打包后位于应用根） */
    ringtone: {
        /** 主叫侧回铃音 + 被叫侧来电铃声共用一段音频，靠音量区分 */
        url: '/audio/phonering.wav',
        /** 被叫来电音量 */
        incomingVolume: 0.8,
        /** 主叫回铃音量：自己拨出的不需要那么响 */
        outgoingVolume: 0.4,
    },

    /**
     * 视频采集约束。分辨率与码率直接决定 TURN 中继带宽成本
     * （720p 每路 1-2Mbps，是语音的 20-40 倍），与后端容量规划同一条待定决策。
     */
    videoConstraints: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 24, max: 30 },
    },
};

/**
 * 托盘右键菜单弹层布局。
 * 主进程按锚点定位窗口、渲染层绘制卡片与投影，两侧共用同一组数值。
 */
export const TRAY_MENU_CONFIG = {
    /** 弹层与托盘图标之间的间距（像素） */
    gap: 2,
    /** 弹层与屏幕工作区边缘的最小间距 */
    screenMargin: 4,
    /** 窗口内围绕菜单卡片的透明留白，用于绘制 CSS 投影（渲染层上报尺寸时需加上） */
    shadowPadding: 8,
    /** 右键时若渲染层尺寸还没上报，等这么久就按占位尺寸先弹出，保证右键必有反馈 */
    readyFallbackMs: 800,
};

// 存放主进程和渲染进程通用的不变常量
export const APP_CONSTANTS = {
    ApplicationName: 'Nexus',

    /** HTTP 请求超时时间（毫秒），主进程 mainRequest 与渲染进程 axios 实例共用。
     *  注：文件上传走独立 XHR 直传 OSS，不受此限制 */
    httpTimeoutMs: 10000,
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
