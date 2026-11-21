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
    /** 更新窗口：下载与安装新版本。强制更新时是唯一的窗口，可选更新时与主窗口并存 */
    Update = 'update',
    /** 历史消息窗口：只开一个，按会话切换内容（已打开时从别的会话再打开，页面原地换会话，不重建窗口） */
    History = 'history',
}
