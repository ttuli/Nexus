import { WindowKey } from './windowKeys';

/**
 * 窗口纯声明式配置（不依赖 Electron 运行时类型，主进程与渲染进程均可安全引用）。
 * 窗口生命周期钩子（hooks）依赖 Electron BrowserWindow/app，由 electron/windows/windowAttribute.ts 挂载。
 */
export interface WindowSpec {
    key: WindowKey;
    url: string;
    parentId?: WindowKey;
    width?: number;
    height?: number;
    minWidth?: number;
    minHeight?: number;
    resizable?: boolean;
    maximizable?: boolean;
    modal?: boolean;
    frame?: boolean;
    transparent?: boolean;
    backgroundColor?: string;
    backgroundMaterial?: 'auto' | 'none' | 'mica' | 'acrylic' | 'tabbed';
    skipTaskbar?: boolean;
    alwaysOnTop?: boolean;
    hasShadow?: boolean;
    center?: boolean;
    show?: boolean;
    /**
     * 窗口已存在时再次打开的处理：默认只聚焦，忽略本次 data；
     * 为 true 时把本次 data 推给页面（WINDOW_DATA）并唤到前台，用于按会话切换内容的窗口
     */
    updateOnReopen?: boolean;
    webPreferences?: {
        webSecurity?: boolean;
        autoplayPolicy?: 'no-user-gesture-required' | 'user-gesture-required' | 'document-user-activation-required';
        devTools?: boolean;
    };
}

/** 窗口管理通用默认参数与超时配置 */
export const WINDOW_DEFAULTS = {
    /** 未指定宽高时的默认尺寸 */
    width: 1200,
    height: 800,
    minWidth: 400,
    minHeight: 300,
    backgroundColor: '#00000000',
    /** 计算安全窗口位置时，保证至少露在屏幕工作区内的最小像素宽/高 */
    minVisibleMargin: 200,
    /** 等待渲染层发送 window:ready 的超时兜底（毫秒），超时后强制 show */
    showTimeoutMs: 5000,
    /** 应用退出时等待所有窗口落盘关闭的超时上限（毫秒），超时后强制 destroy */
    closeTimeoutMs: 10000,
    /** 开发环境独立 DevTools 窗口默认尺寸 */
    devToolsWindow: {
        width: 1000,
        height: 800,
    },
} as const;

/** 各业务窗口的声明式属性配置 */
export const WINDOW_SPECS: Record<WindowKey, WindowSpec> = {
    [WindowKey.Login]: {
        key: WindowKey.Login,
        url: '',
        width: 850,
        height: 600,
        resizable: false,
        frame: false,
        maximizable: false,
    },
    [WindowKey.Home]: {
        key: WindowKey.Home,
        url: '/home',
        modal: false,
        frame: false,
        resizable: true,
        width: 1000,
        height: 830,
        minWidth: 750,
        minHeight: 430,
        transparent: false,
        backgroundColor: '#00000000',
        backgroundMaterial: 'acrylic',
    },
    [WindowKey.AddFriend]: {
        key: WindowKey.AddFriend,
        url: '/addFriend',
        modal: false,
        frame: false,
        resizable: true,
        width: 600,
        height: 600,
    },
    [WindowKey.UserInfo]: {
        key: WindowKey.UserInfo,
        url: '/userInfo',
        modal: false,
        frame: false,
        resizable: true,
        minWidth: 360,
        minHeight: 480,
        width: 480,
        height: 720,
    },
    [WindowKey.Settings]: {
        key: WindowKey.Settings,
        url: '/settings',
        modal: false,
        frame: false,
        resizable: true,
        width: 800,
        height: 600,
        minWidth: 600,
        minHeight: 500,
    },
    [WindowKey.PhotoViewer]: {
        key: WindowKey.PhotoViewer,
        url: '/photoViewer',
        modal: false,
        frame: false,
        resizable: true,
        width: 800,
        height: 600,
        minWidth: 400,
        minHeight: 300,
        backgroundColor: '#00000000', // Transparent for custom background
        webPreferences: {
            webSecurity: true,
        },
    },
    [WindowKey.VideoViewer]: {
        key: WindowKey.VideoViewer,
        url: '/videoViewer',
        modal: false,
        frame: false,
        resizable: true,
        width: 800,
        height: 600,
        minWidth: 400,
        minHeight: 300,
        backgroundColor: '#000000', // Black background for video player
        webPreferences: {
            webSecurity: true,
        },
    },
    [WindowKey.Call]: {
        key: WindowKey.Call,
        url: '/call',
        modal: false,
        frame: false,
        resizable: true,
        width: 400,
        height: 600,
        minWidth: 400,
        minHeight: 600,
        webPreferences: {
            // 通话窗是新开的，用户还没在里面产生过交互，默认自动播放策略会拦掉
            // `new Audio().play()` —— 而来电铃声恰恰必须在用户操作之前就响起。
            // 注：远端音视频不受影响（Chromium 对 getUserMedia/WebRTC 的 MediaStream 免除该策略），
            // 这里放开只为铃声。
            autoplayPolicy: 'no-user-gesture-required',
        },
    },
    [WindowKey.TrayMenu]: {
        key: WindowKey.TrayMenu,
        url: '/trayMenu',
        modal: false,
        frame: false,
        resizable: false,
        maximizable: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        // 系统投影会在透明窗上露出直角边框，投影改由页面 CSS 画
        hasShadow: false,
        transparent: true,
        backgroundColor: '#00000000',
        // 位置由 WindowManager 按托盘图标锚点计算，不能走默认的居中
        center: false,
        // 静默创建：随托盘一起建好并加载页面，但页面 ready 后不自动显示，
        // 等右键托盘时才定位 + show，避免现用现建的加载延迟与首帧闪烁
        show: false,
        // 初始尺寸只是占位，渲染层测量完会上报真实尺寸（窗口此时还未显示，不会看到跳变）
        width: 200,
        height: 240,
        // 弹层远小于普通窗口，必须压掉 createWindow 的 400x300 默认下限
        minWidth: 80,
        minHeight: 60,
        webPreferences: {
            // 开发环境不为弹层附带 DevTools 窗口：它会抢走焦点，菜单刚弹出就被失焦收起
            devTools: false,
        },
    },
    [WindowKey.Update]: {
        key: WindowKey.Update,
        url: '/update',
        modal: false,
        frame: false,
        resizable: false,
        maximizable: false,
        width: 440,
        height: 560,
    },
    [WindowKey.History]: {
        key: WindowKey.History,
        url: '/history',
        modal: false,
        frame: false,
        resizable: true,
        width: 560,
        height: 720,
        minWidth: 420,
        minHeight: 480,
        // 已打开时从别的会话再点「历史消息」：换成新会话的内容，而不是只把旧窗口聚焦
        updateOnReopen: true,
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
} as const;

/** 系统托盘配置 */
export const TRAY_CONFIG = {
    /** 托盘图标缩放尺寸（Windows 推荐 16x16 或 24x24） */
    iconSize: {
        width: 24,
        height: 24,
    },
    menu: TRAY_MENU_CONFIG,
} as const;

/**
 * Electron Session 显式放行的权限白名单（仅对应用自身页面放行）。
 * 包含音视频通话所需的 media / audioCapture / videoCapture 以及剪贴板写入。
 */
export const ALLOWED_MEDIA_PERMISSIONS: readonly string[] = [
    'media',
    'audioCapture',
    'videoCapture',
    'clipboard-sanitized-write',
];
