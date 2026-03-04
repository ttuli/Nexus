import { BrowserWindow } from 'electron'
import os from 'os'

// 检测 Windows 版本
const winBuild = (() => {
    if (process.platform !== 'win32') return 0;
    const parts = os.release().split('.');
    return parseInt(parts[2] || '0', 10);
})();
const isWin11 = winBuild >= 22000;

// 窗口状态接口（用于持久化）
export interface WindowState {
    x?: number;
    y?: number;
    width: number;
    height: number;
    isMaximized?: boolean;
    isMinimized?: boolean;
}

// 窗口创建配置接口
export interface WindowConfig extends Electron.BrowserWindowConstructorOptions {
    key: string;
    url: string;
    data?: Record<string, any>;
    parentId?: string;
    // 是否允许关闭时最小化到托盘（仅对 home 窗口有效）
    allowHideOnClose?: boolean;
}

// 窗口创建请求接口
export interface CreateWindowRequest {
    key: string;
    data?: Record<string, any>;
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
            width: 400,
            height: 570,
            resizable: false,
            frame: false,
            maximizable: false,
            data: {
                key: 'login'
            }
        }
    ],
    [
        'register',
        {
            key: 'register',
            url: '/register',
            modal: true,
            parentId: 'login',
            frame: false,
            resizable: false,
            maximizable: false,
            width: 620,
            height: 780,
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
            // Win10: transparent 不需要开启，SetWindowCompositionAttribute
            //        在 DWM 合成器层面直接替换窗口背景为模糊效果，
            //        不依赖 WS_EX_LAYERED；且关闭后 DWM 能正常绘制阴影。
            // Win11: DwmSetWindowAttribute(SYSTEMBACKDROP_TYPE) 把亚克力画在窗口表面之后，
            //        需要窗口表面透明才能看到，所以必须 transparent: true。
            transparent: isWin11,
            backgroundColor: '#00000000',
            backgroundMaterial: 'acrylic',
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
                webSecurity: false // Allow loading local images
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
                webSecurity: false
            }
        }
    ],
])

export default configs