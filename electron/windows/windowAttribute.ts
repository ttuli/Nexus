import { BrowserWindow } from 'electron'

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
            height: 630,
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
            width: 600,
            height: 730,
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
            allowHideOnClose: true, // 允许关闭时隐藏到托盘
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
            resizable: false,
            width: 600,
            height: 450,
        }
    ],
])

export default configs