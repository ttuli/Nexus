/**
 * 窗口 key —— 主进程窗口注册表与渲染进程 createWindow 调用共享的唯一身份标识。
 * 字符串值必须保持稳定：既用作 windowManager 内部 Map 的键，也随 IPC 传输。
 */
export enum WindowKey {
    Login = 'login',
    Home = 'home',
    AddFriend = 'addFriend',
    UserInfo = 'userInfo',
    Settings = 'settings',
    PhotoViewer = 'photoViewer',
    VideoViewer = 'videoViewer',
    Call = 'call',
    /** 托盘右键菜单弹层：无边框透明小窗，由 TrayManager 按托盘图标锚点定位，失焦即隐藏 */
    TrayMenu = 'trayMenu',
}
