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
     * ICE 服务器兜底配置：**只有 STUN，没有 TURN**。
     *
     * 正常路径是 `callService.getIceServers()` 向后端拉取含 TURN 短时凭证的配置
     * （`GET /message/turnCredential`）。这里仅用于拉取失败时降级。
     *
     * 降级意味着双方都在对称 NAT 后面时通话建不起来（约占 10~20%），
     * 但好过让 TURN 的一次抖动把所有通话都打死。
     *
     * 不要在这里放静态 TURN 账号密码：TURN 是通用流量中继，
     * 密码进了客户端就等于公开，会被拿去白嫖带宽。
     */
    fallbackIceServers: [
        { urls: getEnv('VITE_STUN_SERVER') || 'stun:stun.l.google.com:19302' },
    ] as IceServerConfig[],

    /** 通话结束后停留多久再关窗，留时间让用户看清结束原因 */
    endedCloseDelayMs: 1200,

    /** 本端失败（麦克风不可用、连接不上）时停留更久，失败原因比结束原因长 */
    errorCloseDelayMs: 3000,

    /**
     * 接听后等待媒体连通的上限。
     * 两端候选都没交换成功时 ICE 会一直停在 checking、永远不报 failed，没有这个上限界面会无限「正在连接」。
     * 走 TURN 中继正常 1~3 秒可通，20 秒已足够宽松。
     */
    connectTimeoutMs: 20_000,

    /** 铃声资源 */
    ringtone: {
        /** 主叫侧回铃音 + 被叫侧来电铃声共用一段音频，靠音量区分。路径相对 public/，渲染层经 publicUrl() 取 URL */
        path: 'audio/phonering.wav',
        /** 被叫来电音量 */
        incomingVolume: 0.8,
        /** 主叫回铃音量：自己拨出的不需要那么响 */
        outgoingVolume: 0.4,
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

/**
 * 应用图标，路径相对 public/ 目录。
 * 主进程拼 VITE_PUBLIC 得到文件路径，渲染层经 publicUrl() 得到 URL。
 * 旧版图标（icon_1）存档在仓库根目录的 archive/icon/ 下：不放 public/，免得被打进安装包。
 * index.html 的 favicon、electron-builder.json5 的 win.icon 读不到这里，换图标时要一起改。
 */
export const APP_ICON = {
    /** 窗口、托盘、Logo 等处的常规图标 */
    normal: 'icon/icon.png',
    /** 去色版，空白页占位用 */
    decolor: 'icon/icon-decolor.png',
} as const;

// 存放主进程和渲染进程通用的不变常量
export const APP_CONSTANTS = {
    ApplicationName: 'Nexus',

    /** HTTP 请求超时时间（毫秒），主进程 mainRequest 与渲染进程 axios 实例共用。
     *  注：文件上传走独立 XHR 直传 OSS，不受此限制 */
    httpTimeoutMs: 10000,

    /** 文件上传默认基础超时时间（毫秒） */
    uploadTimeoutMs: 60000,
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

    /**
     * 官网下载页。自动更新走不通（更新源不可达、自动安装失败）时给用户的兜底出口；
     * 未配置则不显示「前往官网下载」。
     * 注：更新源（latest.yml 所在目录）不在这里配，见 electron-builder.json5 的 publish。
     */
    get downloadPageUrl() { return getEnv('VITE_DOWNLOAD_PAGE_URL') || ''; },

    /** 最大图片宽度 */
    maxImageWidth: 280,
    maxImageHeight: 380,

    /** 图片压缩质量 */
    imageCompressQuality: 85,

    /** 下载取消错误信息 */
    ERR_DOWNLOAD_CANCELLED: 'Download cancelled by user',
};
