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

    // WebSocket 相关
    WS_CONNECT: 'ws:connect',
    WS_DISCONNECT: 'ws:disconnect',
    WS_SEND: 'ws:send',
    WS_GET_STATE: 'ws:get-state',
    WS_STATE_CHANGE: 'ws:state-change',
    // WS_MESSAGE_RECEIVED: 'ws:message-received',
    WS_MESSAGE: 'ws:message',
    WS_MESSAGE_ACK: 'ws:message-ack',

    // 窗口相关
    WINDOW_NEW: 'window:new-window',
    WINDOW_MINIMIZE: 'window:minimize',
    WINDOW_MAXIMIZE: 'window:maximize',
    WINDOW_HIDE: 'window:hide',
    WINDOW_SHOW: 'window:show',
    WINDOW_STATE: 'window:state',
    WINDOW_PUBLISH: 'window:publish',
    WINDOW_SEND_TO: 'window:send-to',
    WINDOW_READY: 'window:ready',
    WINDOW_LOAD_ERROR: 'window:load-error',
    WINDOW_IS_FOCUSED: 'window:is-focused',
    WINDOW_PLAY_SOUND: 'window:play-sound',

    // 应用相关
    APP_QUIT: 'app-quit',
    LOGOUT: 'logout',
    LOGOUT_REMIND: 'logout-remind',
    QUIT: 'quit',


    // 路由相关
    ROUTE_NAVIGATE: 'route:navigate',
} as const

export type IpcChannel = typeof IpcChannels[keyof typeof IpcChannels]
