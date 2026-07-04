import { ImTypes, ResourceType, UpdateAction } from '@/src/types';
/**
 * 好友服务
 * 处理好友关系和好友请求的管理
 */

import { ipcService } from './ipcService'
import { useUserStore } from '@/src/store/user'
import { useSessionStore } from '@/src/store/session'
import { IpcChannels } from '@/src/types'
import { applyFriend, deleteFriend, handleFriendApply, updateFriendInfo } from '@/src/apis/user'
import { ApiTypes } from '@/src/types'
import cacheService from './cacheService';
import { generateSessionId } from '@/src/utils/sessionUtils';
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
        let res = await applyFriend(data)
        if (res.data.friend) {
            const friend = res.data.friend;
            const sessionKey = generateSessionId(friend.user_id, friend.friend_id);
            
            const store = useSessionStore();
            const existing = store.getSession(sessionKey);
            store.upsertSession({
                session_key: sessionKey,
                type: ImTypes.SessionType.SESSION_TYPE_PRIVATE,
                max_seq: existing?.max_seq || 0,
                update_time: existing?.update_time || Date.now(),
                last_content: existing?.last_content || '',
                last_sender: existing?.last_sender || 0,
            });
            await cacheService.updateItems(UpdateAction.Add, ResourceType.FRIEND, [res.data.friend]);
        } else if (res.data.data) {
            await cacheService.updateItems(UpdateAction.Add, ResourceType.FRIEND_REQUEST, [res.data.data]);
        }
        return res;
    }

    /**
     * 处理好友申请
     */
    async handleFriendApply(data: ApiTypes.user.HandleFriendApplyReq) {
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

                const userStore = useUserStore();
                await cacheService.updateItems(UpdateAction.Add, ResourceType.FRIEND, [{
                    user_id: userStore.getUserID(),
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

        if (res.data.data) {
            const req = res.data.data;
            const sessionKey = generateSessionId(req.from_user_id, req.to_user_id);
            
            const store = useSessionStore();
            const existing = store.getSession(sessionKey);
            store.upsertSession({
                session_key: sessionKey,
                type: ImTypes.SessionType.SESSION_TYPE_PRIVATE,
                max_seq: existing?.max_seq || 0,
                update_time: existing?.update_time || Date.now(),
                last_content: existing?.last_content || '',
                last_sender: existing?.last_sender || 0,
            });
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
