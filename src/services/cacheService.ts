/**
 * 缓存服务
 * 处理资源缓存的管理
 */

import { ipcService } from './ipcService'
import { ResourceType, UpdateAction, IpcChannels } from '@/types'

class CacheService {
    /**
     * 更新资源项
     * @param action 更新操作类型
     * @param type 资源类型
     * @param items 要更新的资源项
     */
    async updateItems<T>(action: UpdateAction, type: ResourceType, items: T[]): Promise<boolean> {
        const result = await ipcService.invoke(IpcChannels.RESOURCE_UPDATE, action, type, items)
        return result.success
    }
}

export const cacheService = new CacheService()
export default cacheService
