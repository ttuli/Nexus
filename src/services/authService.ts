/**
 * 认证服务
 * 处理 Token 相关操作
 */

import { ipcService } from './ipcService'
import { IpcChannels } from '@/src/types'
import { register, sendCode } from '@/src/apis/auth'
import { ApiTypes } from '@/src/types'

export interface TokenRefreshResult {
    success: boolean
    error?: string
    token?: string
}

export interface LoginResult {
    success: boolean
    userId?: number
    error?: string
}

class AuthService {
    /**
     * 登录（主进程处理）
     * @returns { success, userId?, error? }
     */
    async login(account: string, password: string, remember: boolean = false): Promise<LoginResult> {
        const result = await ipcService.invoke<{ userId?: number }>(IpcChannels.AUTH_LOGIN, { account, password, remember })
        return {
            success: result.success,
            userId: result.data?.userId ?? (result as any).userId,
            error: result.error
        }
    }


    /**
     * 获取设备信息
     */
    async getDeviceInfo(): Promise<any> {
        const result = await ipcService.invoke(IpcChannels.RESOURCE_GET_DEVICE_INFO)
        return result.success ? result.data ?? result : null
    }

    /**
     * 用户注册
     */
    async register(data: ApiTypes.auth.RegisterReq) {
        return register(data)
    }

    /**
     * 发送验证码
     */
    async sendCode(phone: string) {
        return sendCode(phone)
    }
}

export const authService = new AuthService()
export default authService
