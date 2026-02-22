import { mainGet, decodeMainResponse } from './mainRequest';
import { cacheManager } from './cacheManager';
import { ResourceType, ApiTypes } from '../../src/types';
import { config } from '../config';

type FriendInfo = ApiTypes.user.Friend;
type FriendRequest = ApiTypes.user.FriendRequest;

/**
 * 好友服务
 * 在主进程中调用好友相关 API，带缓存
 */
class FriendService {
    // 正在进行的请求（防止重复请求）
    private pendingFriendList: Promise<FriendInfo[]> | null = null;
    private pendingRequests: Promise<FriendRequest[]> | null = null;

    /**
     * 获取好友列表（返回全部好友，无分页）
     */
    public async fetchFriendList(): Promise<FriendInfo[]> {
        if (this.pendingFriendList) {
            console.log('[FriendService] Reusing pending friend list request');
            return this.pendingFriendList;
        }

        this.pendingFriendList = this.doFetchFriendList();

        try {
            const friends = await this.pendingFriendList;
            cacheManager.setItems(ResourceType.FRIEND, friends);
            return friends;
        } finally {
            this.pendingFriendList = null;
        }
    }

    /**
     * 获取待处理的好友申请（返回全部申请，无分页）
     */
    public async fetchPendingRequests(): Promise<FriendRequest[]> {
        if (this.pendingRequests) {
            console.log('[FriendService] Reusing pending requests request');
            return this.pendingRequests;
        }

        this.pendingRequests = this.doFetchPendingRequests();

        try {
            const requests = await this.pendingRequests;
            cacheManager.setItems(ResourceType.FRIEND_REQUEST, requests);
            return requests;
        } finally {
            this.pendingRequests = null;
        }
    }

    // ==================== 内部 API 调用 ====================

    private async doFetchFriendList(): Promise<FriendInfo[]> {
        try {
            const response = await mainGet<any>(`${config.userServer}/user/friend/list`);
            if (response.code === 200) {
                const decoded = decodeMainResponse(response, ApiTypes.user.GetFriendsResp.decode);
                return decoded.data?.data ?? [];
            }
            console.error('[FriendService] API error:', response.message);
            return [];
        } catch (error) {
            console.error('[FriendService] Request error:', error);
            return [];
        }
    }

    private async doFetchPendingRequests(): Promise<FriendRequest[]> {
        try {
            const response = await mainGet<any>(`${config.userServer}/user/friend/apply/pending`);
            if (response.code === 200) {
                const decoded = decodeMainResponse(response, ApiTypes.user.GetPendingFriendAppliesResp.decode);
                return decoded.data?.data ?? [];
            }
            console.error('[FriendService] API error:', response.message);
            return [];
        } catch (error) {
            console.error('[FriendService] Request error:', error);
            return [];
        }
    }
}

export const friendService = new FriendService();
