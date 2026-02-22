import { ImTypes } from '@/types';
/**
 * 好友服务
 * 处理好友关系和好友请求的管理
 */

import { ipcService } from './ipcService'
import { useUserStore } from '@/store/user'
import { IpcChannels } from '@/types'
import { applyFriend, createFriend, handleFriendApply } from '@/apis/user'
import { ApiTypes } from '@/types'

class FriendService {
    /**
     * 获取好友列表（返回全部好友，无分页）
     */
    async fetchFriendList(): Promise<ImTypes.Friend[]> {
        const result = await ipcService.invoke<ImTypes.Friend[]>(IpcChannels.FRIEND_FETCH_LIST)

        if (result.success && result.data) {
            return result.data
        }

        console.error('[FriendService] fetchFriendList failed:', result.error)
        return []
    }

    /**
     * 获取待处理的好友申请（返回全部申请，无分页）
     */
    async fetchPendingRequests(): Promise<ImTypes.FriendRequest[]> {
        const result = await ipcService.invoke<ImTypes.FriendRequest[]>(IpcChannels.FRIEND_FETCH_PENDING)

        if (result.success && result.data) {
            return result.data
        }

        console.error('[FriendService] fetchPendingRequests failed:', result.error)
        return []
    }

    /**
     * 加载好友列表并更新 Store
     */
    async loadFriendListToStore(): Promise<ImTypes.Friend[]> {
        const friends = await this.fetchFriendList()
        const userStore = useUserStore()
        friends.forEach(friend => userStore.setFriend(friend))
        return friends
    }

    /**
     * 加载好友请求列表并更新 Store
     */
    async loadPendingRequestsToStore(): Promise<ImTypes.FriendRequest[]> {
        const requests = await this.fetchPendingRequests()
        const userStore = useUserStore()
        requests.forEach(request => userStore.setFriendRequest(request))
        return requests
    }

    /**
     * 发起好友申请
     */
    async applyFriend(data: ApiTypes.user.NewFriendApplyReq) {
        return applyFriend(data)
    }

    /**
     * 创建好友 (直接添加)
     */
    async createFriend(data: ApiTypes.user.CreateFriendReq) {
        return createFriend(data)
    }

    /**
     * 处理好友申请
     */
    async handleFriendApply(data: ApiTypes.user.HandleFriendApplyReq) {
        return handleFriendApply(data)
    }
}

export const friendService = new FriendService()
export default friendService
