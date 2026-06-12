import { mainGet, decodeMainResponse } from './mainRequest';
import { cacheManager } from './cacheManager';
import { ResourceType, ApiTypes, ImTypes } from '@/src/types';
import { APP_CONSTANTS as config } from '@/src/config/constants';
import { kvCache } from '@/electron/db';

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
     * 获取好友列表（cache-first）
     * 1. 先读 SQLite kvCache，有数据直接返回（无网络，启动快）
     * 2. 缓存为空时才发起 HTTP 请求，并将结果写入缓存
     */
    public async fetchFriendList(): Promise<ImTypes.Friend[]> {
        // 1. 优先读本地 SQLite 缓存
        const cached = kvCache.getAll<ImTypes.Friend>('friend');
        if (cached.length > 0) {
            return cached;
        }

        // 2. 缓存不存在（首次登录 / 缓存过期清除），走网络
        if (this.pendingFriendList) {
            console.log('[FriendService] Reusing pending friend list request');
            const friends = await this.pendingFriendList;
            return friends.map(f => f as unknown as ImTypes.Friend);
        }

        this.pendingFriendList = this.doFetchFriendList();

        try {
            const friends = await this.pendingFriendList;
            const imFriends = friends.map(f => f as unknown as ImTypes.Friend);
            cacheManager.setItems(ResourceType.FRIEND, imFriends);
            return imFriends;
        } finally {
            this.pendingFriendList = null;
        }
    }

    /**
     * 获取待处理的好友申请（返回全部申请，无分页）
     */
    public async fetchPendingRequests(): Promise<ImTypes.FriendRequest[]> {
        if (this.pendingRequests) {
            console.log('[FriendService] Reusing pending requests request');
            const requests = await this.pendingRequests;
            return requests.map(r => r as unknown as ImTypes.FriendRequest);
        }

        this.pendingRequests = this.doFetchPendingRequests();

        try {
            const requests = await this.pendingRequests;
            const imRequests = requests.map(r => r as unknown as ImTypes.FriendRequest);
            cacheManager.setItems(ResourceType.FRIEND_REQUEST, imRequests);
            return imRequests;
        } finally {
            this.pendingRequests = null;
        }
    }

    // ==================== 内部 API 调用 ====================

    private async doFetchFriendList(): Promise<FriendInfo[]> {
        try {
            const response = await mainGet<ApiTypes.user.GetFriendsResp>(`${config.userServer}/user/friend/list`);
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
            const response = await mainGet<ApiTypes.user.GetPendingFriendAppliesResp>(`${config.userServer}/user/friend/apply/pending`);
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
