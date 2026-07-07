/**
 * Services 层统一导出
 * 
 * 提供单一职责的服务模块：
 * - ipcService: IPC 通信封装
 * - authService: 认证层
 * - tokenService: Token 获取与刷新
 * - userService: 用户信息获取
 * - friendService: 好友关系管理
 * - groupService: 群组信息管理
 * - cacheService: 缓存管理
 * - windowService: 窗口操作
 * - listenerService: IPC 监听器管理
 */

export { ipcService, type IpcResponse } from './ipcService'
export { authService, type LoginResult } from './authService'
export { tokenService, type TokenRefreshResult } from './tokenService'
export { userService } from './userService'
export { friendService } from './friendService'
export { groupService } from './groupService'
export { cacheService } from './cacheService'
export { windowService } from './windowService'
export { LogoutType } from '@shared/types'
export { listenerService } from './listeners'
export { websocketService } from './websocketService'
export { chatService } from './chatService'
export { callService } from './callService'
export { messageService } from './messageService'
export { settingService } from './settingService'

export { sessionService } from './sessionService'
 
