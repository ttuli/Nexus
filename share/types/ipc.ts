/**
 * IPC 通信类型定义
 */

// IPC 响应通用类型
export interface IpcResponse<T = any> {
    success: boolean
    data?: T
    error?: string
}

// Token 相关响应
export interface TokenResponse {
    success: boolean
    token?: string
    error?: string
}

export interface RefreshTokenResponse {
    success: boolean
    refreshToken?: string
}

// 设备信息
export interface DeviceInfo {
    deviceId: string
    platform: string
    os?: string
    version?: string
}

// 资源更新通知
export interface ResourceUpdatePayload<T = any> {
    type: ResourceType
    items: T[]
}

// 资源类型（从 resourceCache.ts 导入或重新定义）
import { ResourceType } from './resourceCache'
export { ResourceType }

// IPC 通道定义
export const IpcChannels = {
    // 认证相关
    AUTH_LOGIN: 'auth:login',
    AUTH_ABLE_TO_AUTO_LOGIN: 'able-to-auto-login',

    // 资源相关
    RESOURCE_GET: 'resource:get',
    RESOURCE_UPDATE: 'resource:update',
    RESOURCE_GET_ALL_INFO: 'resource:get-all-info',
    RESOURCE_GET_REFRESH_TOKEN: 'resource:get-refreshToken',
    RESOURCE_REQUEST_TOKEN_REFRESH: 'resource:request-token-refresh',
    RESOURCE_GET_DEVICE_INFO: 'resource:get-device-info',

    // 用户相关
    USER_FETCH_BY_PHONE: 'user:fetch-by-phone',
    USER_FETCH_BY_NAME: 'user:fetch-by-name',
    USER_CACHE_LOGIN_ACCOUNT: 'user:cache-login-account',
    USER_GET_LOGIN_HISTORY: 'user:get-login-history',

    // 好友相关
    FRIEND_FETCH_LIST: 'friend:fetch-list',
    FRIEND_FETCH_PENDING: 'friend:fetch-pending',

    // 群组相关
    GROUP_FETCH_USER_GROUPS: 'group:fetch-user-groups',
    GROUP_FETCH_BY_NAME: 'group:fetch-by-name',
    GROUP_FETCH_MEMBERS: 'group:fetch-members',
    GROUP_FETCH_PENDING_APPLIES: 'group:fetch-pending-applies',
    GROUP_SYNC_MEMBERS: 'group:sync-members',

    // WebSocket 相关
    WS_CONNECT: 'ws:connect',
    WS_DISCONNECT: 'ws:disconnect',
    WS_SEND: 'ws:send',
    /** 通话信令直发：绕开 MessageQueue 的去重/重试，不排队不补投 */
    WS_SEND_SIGNAL: 'ws:send-signal',
    WS_GET_STATE: 'ws:get-state',
    WS_STATE_CHANGE: 'ws:state-change',
    WS_MESSAGE: 'ws:message',
    WS_MESSAGE_ACK: 'ws:message-ack',
    WS_MESSAGE_PERSIST_ACK: 'ws:message-persist-ack',
    WS_NOTIFICATION: 'ws:notification',
    WS_OFFLINE_NOTIFY: 'ws:offline-notify',
    /** 通话信令下行（800-809）：广播到所有窗口，主窗口负责拉起通话窗，通话窗自行消费 SDP/ICE */
    WS_CALL_SIGNAL: 'ws:call-signal',

    // 窗口相关
    WINDOW_NEW: 'window:new-window',
    WINDOW_MINIMIZE: 'window:minimize',
    WINDOW_MAXIMIZE: 'window:maximize',
    WINDOW_CLOSE: 'window:close',
    WINDOW_HIDE: 'window:hide',
    WINDOW_SHOW: 'window:show',
    WINDOW_STATE: 'window:state',
    WINDOW_PUBLISH: 'window:publish',
    WINDOW_SEND_TO: 'window:send-to',
    WINDOW_READY: 'window:ready',
    WINDOW_LOAD_ERROR: 'window:load-error',
    WINDOW_IS_FOCUSED: 'window:is-focused',
    WINDOW_FLASH_FRAME: 'window:flash-frame',

    // 托盘相关
    /** 托盘菜单渲染层上报测量到的弹层尺寸，主进程据此定位窗口 */
    TRAY_MENU_READY: 'tray:menu-ready',
    /** 弹层已显示，通知渲染层播放入场动画（窗口复用，DOM 不重建，必须显式触发） */
    TRAY_MENU_SHOW: 'tray:menu-show',
    /** 托盘菜单项被点击，携带 TrayMenuAction */
    TRAY_MENU_ACTION: 'tray:menu-action',
    /** 托盘菜单请求收起（点击空白处、Esc） */
    TRAY_MENU_CLOSE: 'tray:menu-close',

    // 应用相关
    APP_QUIT: 'app-quit',
    LOGOUT: 'logout',
    LOGOUT_REMIND: 'logout-remind',
    QUIT: 'quit',


    // 路由相关
    ROUTE_NAVIGATE: 'route:navigate',

    // 设置相关
    SETTINGS_GET_STORAGE_PATH: 'settings:get-storage-path',
    SETTINGS_SELECT_STORAGE_PATH: 'settings:select-storage-path',

    // 系统操作相关
    SYSTEM_SHOW_IN_FOLDER: 'system:show-in-folder',
    SYSTEM_FILE_EXISTS: 'system:file-exists',
    SYSTEM_DOWNLOAD_FILE: 'system:download-file',
    SYSTEM_CANCEL_DOWNLOAD: 'system:cancel-download',
    SYSTEM_SAVE_IMAGE_BUFFER: 'system:save-image-buffer',

    // 消息存储相关（主进程 SQLite ↔ 渲染进程 IPC）
    MSG_SAVE: 'msg:save',
    MSG_SAVE_MANY: 'msg:save-many',
    MSG_UPDATE_STATUS: 'msg:update-status',
    MSG_UPDATE_LOCAL_PATH: 'msg:update-local-path',
    MSG_GET_HISTORY: 'msg:get-history',
    MSG_CLEAR_SESSION: 'msg:clear-session',
    MSG_DELETE: 'msg:delete',
    MSG_GET_LATEST: 'msg:get-latest',

    // 会话列表存储相关
    SESSION_GET: 'session:get',
    SESSION_GET_LIST: 'session:get-list',
    SESSION_SAVE_LIST: 'session:save-list',
    SESSION_DELETE: 'session:delete',

    // 主题相关
    THEME_SYNC: 'theme:sync',

    // 应用更新相关
    /** 拉取待提示的可选更新（窗口挂载晚于启动检查完成时，靠它补上错过的推送） */
    UPDATE_GET_PROMPT: 'update:get-prompt',
    /** 主进程推送：发现可选更新，由登录窗 / 主窗口弹提示框 */
    UPDATE_PROMPT: 'update:prompt',
    /** 用户对更新提示框的选择，携带 UpdatePromptAction */
    UPDATE_PROMPT_RESPOND: 'update:prompt-respond',
    /** 更新窗口拉取当前状态 */
    UPDATE_GET_STATE: 'update:get-state',
    /** 主进程推送：更新状态变化（含下载进度），只发给更新窗口 */
    UPDATE_STATE: 'update:state',
    /** 重新检查并下载 */
    UPDATE_RETRY: 'update:retry',
    /** 退出并安装已下载的新版本 */
    UPDATE_INSTALL: 'update:install',
    /** 关闭更新窗口：可选更新即放弃本次下载，强制更新即退出应用 */
    UPDATE_CLOSE: 'update:close',
    /** 用系统浏览器打开官网下载页 */
    UPDATE_OPEN_DOWNLOAD_PAGE: 'update:open-download-page',
    /** 在资源管理器中定位已下载的安装包（自动安装失败时让用户手动运行） */
    UPDATE_SHOW_INSTALLER: 'update:show-installer',
} as const

export type IpcChannel = typeof IpcChannels[keyof typeof IpcChannels]
