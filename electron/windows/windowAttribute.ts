import { BrowserWindow, app } from 'electron'
import { WindowKey } from '@shared/config/windowKeys'

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
    onClosed?: (wm?: any) => void;
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
    key: WindowKey;
    url: string;
    data?: Record<string, any>;
    parentId?: WindowKey;
    // 窗口专属生命周期钩子
    hooks?: WindowHooks;
}

// 窗口创建请求接口
export interface CreateWindowRequest {
    key: WindowKey;
    data?: Record<string, any>;
    /** 可选：覆盖窗口默认宽高（像素，主进程屏幕坐标系） */
    windowSize?: { width: number; height: number };
}

// 管理的窗口接口
export interface ManagedWindow {
    key: WindowKey;
    window: BrowserWindow;
    url: string;
    data?: Record<string, any>;
    // 事件监听器清理函数
    cleanup?: () => void;
}

let configs: Map<WindowKey, WindowConfig> = new Map([
    [
        WindowKey.Login,
        {
            key: WindowKey.Login,
            url: '',
            width: 850,
            height: 600,
            resizable: false,
            frame: false,
            maximizable: false,
            hooks: {
                onClosed: (wm?: any) => {
                    // 如果不是在向 home 窗口过渡，则退出应用
                    if (!wm || !wm.getWindow(WindowKey.Home)) {
                        app.quit();
                    }
                }
            }
        }
    ],
    [
        WindowKey.Home,
        {
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
            hooks: {
                onClose: (window: BrowserWindow, event: Electron.Event) => {
                    event.preventDefault();
                    window.hide();
                }
            }
        }
    ],
    [
        WindowKey.AddFriend,
        {
            key: WindowKey.AddFriend,
            url: '/addFriend',
            modal: false,
            frame: false,
            resizable: true,
            width: 600,
            height: 600,
        }
    ],
    [
        WindowKey.UserInfo,
        {
            key: WindowKey.UserInfo,
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
        WindowKey.Settings,
        {
            key: WindowKey.Settings,
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
        WindowKey.PhotoViewer,
        {
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
                webSecurity: true
            }
        }
    ],
    [
        WindowKey.VideoViewer,
        {
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
                webSecurity: true
            }
        }
    ],
    [
        WindowKey.Call,
        {
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
        }
    ]
])

export default configs