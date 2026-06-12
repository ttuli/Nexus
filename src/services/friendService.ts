import { ImTypes, ResourceType, UpdateAction } from '@/src/types';
/**
 * 好友服务
 * 处理好友关系和好友请求的管理
 */

import { ipcService } from './ipcService'
import { useUserStore } from '@/src/store/user'
import { IpcChannels } from '@/src/types'
import { applyFriend, createFriend, deleteFriend, handleFriendApply, updateFriendInfo } from '@/src/apis/user'
import { ApiTypes } from '@/src/types'
import cacheService from './cacheService';

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

    /**
     *  删除好友
     */
    async deleteFriend(friendId: number) {
        await deleteFriend(friendId)
        await cacheService.updateItems(UpdateAction.Delete, ResourceType.FRIEND, [{
            friend_id: friendId,
            user_id: 0,
            remark: '',
            starred: false,
            blocked: false,
            source: ImTypes.FriendSource.UNRECOGNIZED,
            create_time: 0,
            extra: '',
        }])
    }

    /**
     * 更新好友信息
     */
    async updateFriend(data: ApiTypes.user.UpdateFriendReq) {
        let res = await updateFriendInfo(data)
        await cacheService.updateItems(UpdateAction.Update, ResourceType.FRIEND, [res.data.data as ImTypes.Friend])
    }
}

export const friendService = new FriendService()
export default friendService
