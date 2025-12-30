import { BrowserWindow } from 'electron'


interface WindowConfig extends Electron.BrowserWindowConstructorOptions {
    key: string;
    url: string;
    data?: Record<string, any>;
    parentId?:string;
}

interface ManagedWindow {
    key: string;
    window: BrowserWindow;
    url: string;
    data?: Record<string, any>;
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

export type {
    WindowConfig,
    ManagedWindow
}

export default configs