import { BrowserWindow, app } from 'electron'

// 窗口状态接口（用于持久化）
export interface WindowState {
    x?: number;
    y?: number;
    width: number;
    height: number;
    isMaximized?: boolean;
    isMinimized?: boolean;
}

// 窗口生命周期钩子接口
export interface WindowHooks {
    /** 窗口将要关闭时（window 还未销毁，可用于保存状态或阻止关闭） */
    onClose?: (window: BrowserWindow, event: Electron.Event) => void;
    /** 窗口已关闭销毁后 */
    onClosed?: () => void;
    /** 窗口获得焦点时 */
    onFocus?: (window: BrowserWindow) => void;
    /** 窗口最大化时 */
    onMaximize?: (window: BrowserWindow) => void;
    /** 窗口最小化时 */
    onMinimize?: (window: BrowserWindow) => void;
    /** 窗口还原时 */
    onRestore?: (window: BrowserWindow) => void;
}

// 窗口创建配置接口
export interface WindowConfig extends Electron.BrowserWindowConstructorOptions {
    key: string;
    url: string;
    data?: Record<string, any>;
    parentId?: string;
    // 是否允许关闭时最小化到托盘（仅对 home 窗口有效）
    allowHideOnClose?: boolean;
    // 最大化时的背景色，用于替代默认背景色
    maximizeBackgroundColor?: string;
    // 窗口专属生命周期钩子
    hooks?: WindowHooks;
}

// 窗口创建请求接口
export interface CreateWindowRequest {
    key: string;
    data?: Record<string, any>;
    /** 可选：覆盖窗口默认宽高（像素，主进程屏幕坐标系） */
    windowSize?: { width: number; height: number };
}

// 管理的窗口接口
export interface ManagedWindow {
    key: string;
    window: BrowserWindow;
    url: string;
    data?: Record<string, any>;
    // 事件监听器清理函数
    cleanup?: () => void;
}

let configs: Map<string, WindowConfig> = new Map([
    [
        'login',
        {
            key: 'login',
            url: '',
            width: 850,
            height: 600,
            resizable: false,
            frame: false,
            maximizable: false,
            data: {
                key: 'login'
            },
            hooks: {
                onClosed: () => {
                    app.quit();
                }
            }
        }
    ],
    [
        'home',
        {
            key: 'home',
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
            hooks: {
                onClose: (window: BrowserWindow, event: Electron.Event) => {
                    event.preventDefault();
                    window.hide();
                }
            }
        }
    ],
    [
        'addFriend',
        {
            key: 'addFriend',
            url: '/addFriend',
            modal: false,
            frame: false,
            resizable: true,
            width: 600,
            height: 600,
        }
    ],
    [
        'userInfo',
        {
            key: 'userInfo',
            url: '/userInfo',
            modal: false,
            frame: false,
            resizable: true,
            minWidth: 360,
            minHeight: 480,
            width: 480,
            height: 720,
        }
    ],
    [
        'settings',
        {
            key: 'settings',
            url: '/settings',
            modal: false,
            frame: false,
            resizable: true,
            width: 800,
            height: 600,
            minWidth: 600,
            minHeight: 500,
        }
    ],
    [
        'photoViewer',
        {
            key: 'photoViewer',
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
                webSecurity: true
            }
        }
    ],
    [
        'videoViewer',
        {
            key: 'videoViewer',
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
                webSecurity: true
            }
        }
    ],
    [
        'call',
        {
            key: 'call',
            url: '/call',
            modal: false,
            frame: false,
            resizable: true,
            width: 400,
            height: 600,
            minWidth: 400,
            minHeight: 600,
        }
    ]
])

export default configs