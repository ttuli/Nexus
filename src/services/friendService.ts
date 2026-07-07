import { ImTypes, ResourceType, UpdateAction } from '@shared/types';
/**
 * 好友服务
 * 处理好友关系和好友请求的管理
 */

import { ipcService } from './ipcService'
import { IpcChannels } from '@shared/types'
import { applyFriend, deleteFriend, handleFriendApply, updateFriendInfo } from '@/src/apis/user'
import { ApiTypes } from '@shared/types'
import cacheService from './cacheService';
import { convertApplySrc2FriendSrc } from '@/src/utils/messageConverter';

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
     * 发起好友申请
     */
    async applyFriend(data: ApiTypes.user.NewFriendApplyReq) {
        let res = await applyFriend(data)
        if (res.data.friend) {
            await cacheService.updateItems(UpdateAction.Add, ResourceType.FRIEND, [res.data.friend]);
        } else if (res.data.data) {
            await cacheService.updateItems(UpdateAction.Add, ResourceType.FRIEND_REQUEST, [res.data.data]);
        }
        return res;
    }

    /**
     * 处理好友申请
     */
    async handleFriendApply(data: ApiTypes.user.HandleFriendApplyReq, myUserId: number) {
        let res = await handleFriendApply(data);
        
        if (res.data.data) {
            const req = res.data.data;
            await cacheService.updateItems(UpdateAction.Update, ResourceType.FRIEND_REQUEST, [req as ImTypes.FriendRequest]);

            if (data.result === ImTypes.ApplyStatus.APPLY_STATUS_AGREED) {
                let source: ImTypes.ApplySource;
                if (req.source === ImTypes.ApplySource.APPLY_SOURCE_SEARCH_ACCOUNT ||
                    req.source === ImTypes.ApplySource.APPLY_SOURCE_SEARCH_PHONE ||
                    req.source === ImTypes.ApplySource.APPLY_SOURCE_SEARCH_NAME) {
                    source = ImTypes.ApplySource.APPLY_SOURCE_SEARCH_ACCOUNT;
                } else if (req.source === ImTypes.ApplySource.APPLY_SOURCE_FROM_GROUP) {
                    source = ImTypes.ApplySource.APPLY_SOURCE_FROM_GROUP;
                } else {
                    source = ImTypes.ApplySource.APPLY_SOURCE_FROM_RECOMMEND;
                }

                await cacheService.updateItems(UpdateAction.Add, ResourceType.FRIEND, [{
                    user_id: myUserId,
                    friend_id: req.from_user_id,
                    remark: '',
                    blocked: false,
                    starred: false,
                    create_time: res.data.data?.handle_time,
                    source: convertApplySrc2FriendSrc(source),
                    extra: ""
                } as ImTypes.Friend]);
            }
        }
        return res;
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
