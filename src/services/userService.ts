import { ImTypes } from '@/types';
/**
 * 用户服务
 * 处理用户信息的获取
 */

import { ipcService } from './ipcService'
import { useUserStore } from '@/store/user'
import { ResourceType, IpcChannels, UpdateAction } from '@/types'
import { updateUserInfo } from '@/apis/user'
import cacheService from './cacheService'

class UserService {
    /**
     * 按 ID 批量获取用户信息
     * @param ids 用户 ID 数组
     * @param forceUpdate 是否强制从服务器获取（跳过缓存）
     */
    async fetchByIds(ids: number[], forceUpdate: boolean = false): Promise<ImTypes.UserInfo[]> {
        const result = await ipcService.invoke<{ items?: ImTypes.UserInfo[] }>(IpcChannels.RESOURCE_GET, ResourceType.USER, ids, forceUpdate)

        if (result.success) {
            const users = (result.data as any)?.items ?? (result as any).items ?? []
            // 更新 Store
            const userStore = useUserStore()
            users.forEach((user: ImTypes.UserInfo) => userStore.setUser(user))
            return users
        }

        console.error('[UserService] fetchByIds failed:', result.error)
        return []
    }

    /**
     * 按手机号获取用户信息
     */
    async fetchByPhone(phone: string): Promise<ImTypes.UserInfo[]> {
        const result = await ipcService.invoke<ImTypes.UserInfo[]>(IpcChannels.USER_FETCH_BY_PHONE, phone)

        if (result.success && result.data) {
            const userStore = useUserStore()
            result.data.forEach((user: ImTypes.UserInfo) => userStore.setUser(user))
            return result.data
        }

        console.error('[UserService] fetchByPhone failed:', result.error)
        return []
    }

    /**
     * 按昵称获取用户信息
     * @param name 用户昵称
     * @param limit 返回数量限制，默认 20
     * @param offset 偏移量，默认 0
     */
    async fetchByName(name: string, limit: number = 20, offset: number = 0): Promise<ImTypes.UserInfo[]> {
        const result = await ipcService.invoke<ImTypes.UserInfo[]>(IpcChannels.USER_FETCH_BY_NAME, name, limit, offset)

        if (result.success && result.data) {
            const userStore = useUserStore()
            result.data.forEach((user: ImTypes.UserInfo) => userStore.setUser(user))
            return result.data
        }

        console.error('[UserService] fetchByName failed:', result.error)
        return []
    }

    /**
     * 更新用户信息
     */
    async updateUserInfo(changes: ImTypes.UserInfo): Promise<boolean> {
        try {
            await updateUserInfo(changes)
            await cacheService.updateItems(UpdateAction.Update, ResourceType.USER, [{ ...changes }])
            return true

        } catch (e) {
            console.error('[UserService] updateUserInfo failed:', e)
        }
        return false
    }

    /**
     * 缓存登录账号信息（头像）
     * 修改头像后调用，更新本地缓存
     */
    async cacheLoginAccount(userId: number): Promise<boolean> {
        const response = await ipcService.invoke(IpcChannels.USER_CACHE_LOGIN_ACCOUNT, userId)
        return response.success
    }

    /**
     * 获取登录历史记录
     */
    async getLoginHistory(): Promise<{ userId: number; name: string; avatarLocal?: string; lastLoginTime: number }[]> {
        const response = await ipcService.invoke<{ userId: number; name: string; avatarLocal?: string; lastLoginTime: number }[]>(IpcChannels.USER_GET_LOGIN_HISTORY)
        return response.data || []
    }
}

export const userService = new UserService()
export default userService
