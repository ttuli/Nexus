/**
 * Token 服务
 * 处理前端 Token 获取、持久判断与刷新请求
 */

import { ipcService } from './ipcService'
import { IpcChannels } from '@/types'

export interface TokenRefreshResult {
    success: boolean
    error?: string
    token?: string
}

class TokenService {
    /**
     * 判断是否能自动登录（即是否存在 RefreshToken）
     */
    async ableToAutoLogin(): Promise<boolean> {
        const result = await ipcService.invoke<boolean>(IpcChannels.AUTH_ABLE_TO_AUTO_LOGIN)
        return result.data ?? false
    }

    /**
     * 请求刷新 Token
     */
    async requestTokenRefresh(): Promise<TokenRefreshResult> {
        const result = await ipcService.invoke<{ token?: string }>(IpcChannels.RESOURCE_REQUEST_TOKEN_REFRESH)
        return {
            success: result.success,
            error: result.error
        }
    }

    /**
     * 获取所有基础认证信息（包括 Token 和 RefreshToken）
     */
    async getAllInfo(): Promise<{ success: boolean; token?: string }> {
        const result = await ipcService.invoke<{ token?: string }>(IpcChannels.RESOURCE_GET_ALL_INFO)
        return {
            success: result.success,
            token: result.data?.token ?? (result as any).token
        }
    }
}

export const tokenService = new TokenService()
export default tokenService
