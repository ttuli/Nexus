import { cacheManager } from './cacheManager';
import { mainGet, decodeMainResponse } from './mainRequest';
import { ResourceType, ImTypes, ApiTypes } from '../../src/types';
type UserInfo = ImTypes.UserInfo;
import { storage, StorageKeys } from '../utils/storage';
import { config } from '../config';
import { fileCacheManager } from './fileCacheManager';

// 登录历史记录类型
export interface LoginAccountInfo {
    userId: number;
    account: string;  // 登录账号
    name: string;
    avatarUrl?: string;  // 头像网络地址
    lastLoginTime: number;
}

// 请求合并：正在进行的请求
type PendingRequest<T> = {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (reason?: any) => void;
};

/**
 * 用户服务
 * 在主进程中直接调用用户 API，带缓存和请求合并
 */
class UserService {
    private pendingByIds: Map<string, PendingRequest<UserInfo[]>> = new Map();
    private pendingByPhone: Map<string, PendingRequest<UserInfo[]>> = new Map();
    private pendingByName: Map<string, PendingRequest<UserInfo[]>> = new Map();

    /**
     * 按 ID 批量获取用户信息
     * @param ids 用户 ID 数组
     * @param forceUpdate 是否强制从服务器获取（跳过缓存）
     */
    public async fetchUsersByIds(ids: number[], forceUpdate: boolean = false): Promise<UserInfo[]> {
        if (ids.length === 0) return [];

        let cachedUsers: UserInfo[] = [];
        let idsToFetch: number[] = ids;

        // 1. 检查缓存（除非强制更新）
        if (!forceUpdate) {
            const { items, missingIds } = cacheManager.getItems<UserInfo>(ResourceType.USER, ids);
            cachedUsers = items;
            idsToFetch = missingIds;

            if (idsToFetch.length === 0) {
                return cachedUsers;
            }
        }

        // 2. 检查是否有正在进行的请求
        const key = idsToFetch.sort().join(',');
        const pending = this.pendingByIds.get(key);
        if (pending) {
            const fetchedUsers = await pending.promise;
            return [...cachedUsers, ...fetchedUsers];
        }

        // 3. 发起新请求
        let resolvePromise: (value: UserInfo[]) => void;
        let rejectPromise: (reason?: any) => void;
        const promise = new Promise<UserInfo[]>((resolve, reject) => {
            resolvePromise = resolve;
            rejectPromise = reject;
        });

        this.pendingByIds.set(key, { promise, resolve: resolvePromise!, reject: rejectPromise! });

        try {
            const usersApi = await this.doFetchUsersByIds(idsToFetch);
            const users = usersApi.map(u => u as unknown as UserInfo);
            cacheManager.setItems(ResourceType.USER, users);
            resolvePromise!(users);
            return [...cachedUsers, ...users];
        } catch (error) {
            rejectPromise!(error);
            throw error;
        } finally {
            this.pendingByIds.delete(key);
        }
    }

    /**
     * 按手机号获取用户信息
     */
    public async fetchUserByPhone(phone: string): Promise<UserInfo[]> {
        if (!phone) return [];

        // 检查是否有正在进行的请求
        const pending = this.pendingByPhone.get(phone);
        if (pending) {
            return pending.promise;
        }

        let resolvePromise: (value: UserInfo[]) => void;
        let rejectPromise: (reason?: any) => void;
        const promise = new Promise<UserInfo[]>((resolve, reject) => {
            resolvePromise = resolve;
            rejectPromise = reject;
        });

        this.pendingByPhone.set(phone, { promise, resolve: resolvePromise!, reject: rejectPromise! });

        try {
            const usersApi = await this.doFetchUserByQuery({ phone });
            const users = usersApi.map(u => u as unknown as UserInfo);
            cacheManager.setItems(ResourceType.USER, users);
            resolvePromise!(users);
            return users;
        } catch (error) {
            rejectPromise!(error);
            throw error;
        } finally {
            this.pendingByPhone.delete(phone);
        }
    }

    /**
     * 按昵称获取用户信息
     * @param name 用户昵称
     * @param limit 返回数量限制，默认 20
     * @param offset 偏移量，默认 0
     */
    public async fetchUserByName(name: string, limit: number = 20, offset: number = 0): Promise<UserInfo[]> {
        if (!name) return [];

        const key = `${name}_${limit}_${offset}`;
        const pending = this.pendingByName.get(key);
        if (pending) {
            return pending.promise;
        }

        let resolvePromise: (value: UserInfo[]) => void;
        let rejectPromise: (reason?: any) => void;
        const promise = new Promise<UserInfo[]>((resolve, reject) => {
            resolvePromise = resolve;
            rejectPromise = reject;
        });

        this.pendingByName.set(key, { promise, resolve: resolvePromise!, reject: rejectPromise! });

        try {
            const usersApi = await this.doFetchUserByQuery({ name, limit, offset });
            const users = usersApi.map(u => u as unknown as UserInfo);
            cacheManager.setItems(ResourceType.USER, users);
            resolvePromise!(users);
            return users;
        } catch (error) {
            rejectPromise!(error);
            throw error;
        } finally {
            this.pendingByName.delete(key);
        }
    }

    // ==================== 内部 API 调用 ====================

    /**
     * 调用 API 获取用户信息（按 ID）
     */
    private async doFetchUsersByIds(ids: number[]): Promise<ApiTypes.user.UserInfo[]> {
        const params = ids.map(id => `ids=${id}`).join('&');
        return this.doRequest(`${config.userServer}/user/info?${params}`);
    }

    /**
     * 调用 API 获取用户信息（按 phone/name）
     */
    private async doFetchUserByQuery(query: { phone?: string; name?: string; limit?: number; offset?: number }): Promise<ApiTypes.user.UserInfo[]> {
        const params = new URLSearchParams();
        if (query.phone) params.append('phone', query.phone);
        if (query.name) params.append('name', query.name);
        if (query.limit !== undefined) params.append('limit', query.limit.toString());
        if (query.offset !== undefined) params.append('offset', query.offset.toString());

        return this.doRequest(`${config.userServer}/user/info?${params.toString()}`);
    }

    /**
     * 通用 GET 请求（使用 mainRequest，自动处理 token 刷新）
     */
    private async doRequest(url: string): Promise<ApiTypes.user.UserInfo[]> {
        try {
            const response = await mainGet<ApiTypes.user.GetUserInfoResp>(url);
            if (response.code === 200) {
                const decoded = decodeMainResponse(response, ApiTypes.user.GetUserInfoResp.decode);
                return decoded.data?.data ?? [];
            } else {
                console.error('[UserService] API error:', response.message);
                return [];
            }
        } catch (error) {
            console.error('[UserService] Request error:', error);
            return [];
        }
    }

    // ==================== 登录历史缓存 ====================

    /**
     * 缓存登录账号信息（头像和用户名）
     * @param userId 用户 ID
     * @param account 登录账号
     */
    public async cacheLoginAccount(userId: number, account?: string): Promise<void> {
        if (!userId || userId <= 0 || !Number.isInteger(userId)) {
            console.error('[UserService] Invalid userId:', userId);
            return;
        }

        try {
            // 1. 获取用户最新信息
            const users = await this.fetchUsersByIds([userId], true);
            if (users.length === 0) {
                console.error('[UserService] User not found:', userId);
                return;
            }

            const userInfo = users[0];

            // 2. 后台预热头像到本地磁盘（非阅塞）
            if (userInfo.avatar) {
                fileCacheManager.prefetch(userInfo.avatar);
            }

            // 3. 读取现有登录历史
            let loginHistory: LoginAccountInfo[] = storage.get<LoginAccountInfo[]>(StorageKeys.LOGIN_HISTORY) || [];

            // 4. 更新或添加账号记录
            const existingIndex = loginHistory.findIndex(acc => acc.userId === userId);
            const accountInfo: LoginAccountInfo = {
                userId,
                account: account || (existingIndex !== -1 ? loginHistory[existingIndex].account : ''),
                name: userInfo.user_name,
                avatarUrl: userInfo.avatar,  // 只存网络 URL，前端通过 imcache:// 协议渲染
                lastLoginTime: Date.now(),
            };

            if (existingIndex !== -1) loginHistory.splice(existingIndex, 1);
            loginHistory.unshift(accountInfo);

            // 5. 最多保留 5 个账号记录（不再需要手动删除本地文件，由 fileCacheManager LRU 统一管理）
            if (loginHistory.length > 5) loginHistory.splice(5);

            // 6. 保存
            storage.set(StorageKeys.LOGIN_HISTORY, loginHistory);
            console.log('[UserService] Login account cached:', userId);
        } catch (error) {
            console.error('[UserService] Failed to cache login account:', error);
        }
    }

    /**
     * 获取登录历史记录
     */
    public getLoginHistory(): LoginAccountInfo[] {
        return storage.get<LoginAccountInfo[]>(StorageKeys.LOGIN_HISTORY) || [];
    }
}

export const userService = new UserService();

