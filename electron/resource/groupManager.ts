import { cacheManager } from './cacheManager';
import { mainGet, decodeMainResponse } from './mainRequest';
import { ResourceType, ApiTypes, ImTypes } from '@/src/types';
import { APP_CONSTANTS as config } from '@/src/config/constants';

type Group = ImTypes.GroupInfo;
type GroupMember = ImTypes.GroupMember;
type GroupRequest = ImTypes.GroupApply;

// 请求合并：正在进行的请求
type PendingRequest<T> = {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (reason?: any) => void;
};

/**
 * 群组服务
 * 在主进程中直接调用群组 API，带缓存和请求合并
 */
class GroupService {
    private pendingByIds: Map<string, PendingRequest<Group[]>> = new Map();
    private pendingByName: Map<string, PendingRequest<Group[]>> = new Map();
    private pendingMembers: Map<number, PendingRequest<GroupMember[]>> = new Map();
    private pendingUserGroups: Map<string, PendingRequest<number[]>> = new Map();
    private pendingApplies: Map<string, PendingRequest<GroupRequest[]>> = new Map();

    /**
     * 按 ID 批量获取群组信息
     */
    public async fetchGroupsByIds(ids: number[], forceUpdate: boolean = false): Promise<Group[]> {
        if (ids.length === 0) return [];

        let cachedGroups: Group[] = [];
        let idsToFetch: number[] = ids;

        if (!forceUpdate) {
            const { items, missingIds } = await cacheManager.getItems<Group>(ResourceType.GROUP, ids);
            cachedGroups = items;
            idsToFetch = missingIds;
            if (idsToFetch.length === 0) return cachedGroups;
        }

        const key = idsToFetch.sort().join(',');
        const pending = this.pendingByIds.get(key);
        if (pending) {
            const fetchedGroups = await pending.promise;
            return [...cachedGroups, ...fetchedGroups];
        }

        let resolvePromise: (value: Group[]) => void;
        let rejectPromise: (reason?: any) => void;
        const promise = new Promise<Group[]>((resolve, reject) => {
            resolvePromise = resolve;
            rejectPromise = reject;
        });

        this.pendingByIds.set(key, { promise, resolve: resolvePromise!, reject: rejectPromise! });

        try {
            const groupsApi = await this.doFetchGroupsByIds(idsToFetch);
            const groups = groupsApi.map(g => g as unknown as Group);
            await cacheManager.setItems(ResourceType.GROUP, groups);
            resolvePromise!(groups);
            return [...cachedGroups, ...groups];
        } catch (error) {
            rejectPromise!(error);
            throw error;
        } finally {
            this.pendingByIds.delete(key);
        }
    }

    /**
     * 按群名获取群组信息
     */
    public async fetchGroupsByName(name: string, limit: number = 20, offset: number = 0): Promise<Group[]> {
        if (!name) return [];

        const key = `${name}_${limit}_${offset}`;
        const pending = this.pendingByName.get(key);
        if (pending) return pending.promise;

        let resolvePromise: (value: Group[]) => void;
        let rejectPromise: (reason?: any) => void;
        const promise = new Promise<Group[]>((resolve, reject) => {
            resolvePromise = resolve;
            rejectPromise = reject;
        });

        this.pendingByName.set(key, { promise, resolve: resolvePromise!, reject: rejectPromise! });

        try {
            const groupsApi = await this.doFetchGroupsByQuery({ name, limit, offset });
            const groups = groupsApi.map(g => g as unknown as Group);
            await cacheManager.setItems(ResourceType.GROUP, groups);
            resolvePromise!(groups);
            return groups;
        } catch (error) {
            rejectPromise!(error);
            throw error;
        } finally {
            this.pendingByName.delete(key);
        }
    }

    /**
     * 按群号获取群成员列表
     */
    public async fetchGroupMembers(groupId: number, forceUpdate: boolean = false): Promise<GroupMember[]> {
        if (!groupId) return [];

        if (!forceUpdate) {
            const wrapper = await cacheManager.getItem<any>(ResourceType.GROUP_MEMBER, groupId);
            if (wrapper && wrapper.members) return wrapper.members;
        }

        const pending = this.pendingMembers.get(groupId);
        if (pending) return pending.promise;

        let resolvePromise: (value: GroupMember[]) => void;
        let rejectPromise: (reason?: any) => void;
        const promise = new Promise<GroupMember[]>((resolve, reject) => {
            resolvePromise = resolve;
            rejectPromise = reject;
        });

        this.pendingMembers.set(groupId, { promise, resolve: resolvePromise!, reject: rejectPromise! });

        try {
            const membersApi = await this.doFetchGroupMembers(groupId);
            const members = membersApi.map(m => m as unknown as GroupMember);
            await cacheManager.setItem(ResourceType.GROUP_MEMBER, { group_id: groupId, members });
            resolvePromise!(members);
            return members;
        } catch (error) {
            rejectPromise!(error);
            throw error;
        } finally {
            this.pendingMembers.delete(groupId);
        }
    }

    /**
     * 批量获取群成员列表（用于 ipc resource:get）
     */
    public async fetchGroupMembersByIds(groupIds: number[], forceUpdate: boolean = false): Promise<any[]> {
        const promises = groupIds.map(async (groupId) => {
            try {
                const members = await this.fetchGroupMembers(groupId, forceUpdate);
                return { group_id: groupId, members };
            } catch {
                return { group_id: groupId, members: [] };
            }
        });
        return Promise.all(promises);
    }

    /**
     * 获取当前用户加入的群组 ID 列表
     */
    public async fetchUserGroupIds(): Promise<number[]> {
        const cached = cacheManager.getUserGroupIds();
        if (cached.length > 0) return cached;

        const key = 'userGroups';
        const pending = this.pendingUserGroups.get(key);
        if (pending) return pending.promise;

        let resolvePromise: (value: number[]) => void;
        let rejectPromise: (reason?: any) => void;
        const promise = new Promise<number[]>((resolve, reject) => {
            resolvePromise = resolve;
            rejectPromise = reject;
        });

        this.pendingUserGroups.set(key, { promise, resolve: resolvePromise!, reject: rejectPromise! });

        try {
            const response = await mainGet<ApiTypes.group.GetUserGroupsResp>(`${config.groupServer}/group/list`);
            if (response.code === 200) {
                const decoded = decodeMainResponse(response, ApiTypes.group.GetUserGroupsResp.decode);
                const groupIds = decoded.data?.data ?? [];
                await cacheManager.setUserGroupIds(groupIds);
                resolvePromise!(groupIds);
                return groupIds;
            } else {
                console.error('[GroupService] fetchUserGroupIds API error:', response.message);
                resolvePromise!([]);
                return [];
            }
        } catch (error) {
            console.error('[GroupService] fetchUserGroupIds error:', error);
            rejectPromise!(error);
            throw error;
        } finally {
            this.pendingUserGroups.delete(key);
        }
    }

    /**
     * 获取待处理的群申请
     */
    public async fetchPendingApplies(): Promise<GroupRequest[]> {
        const key = 'pendingApplies';
        const pending = this.pendingApplies.get(key);
        if (pending) return pending.promise;

        let resolvePromise: (value: GroupRequest[]) => void;
        let rejectPromise: (reason?: any) => void;
        const promise = new Promise<GroupRequest[]>((resolve, reject) => {
            resolvePromise = resolve;
            rejectPromise = reject;
        });

        this.pendingApplies.set(key, { promise, resolve: resolvePromise!, reject: rejectPromise! });

        try {
            const response = await mainGet<ApiTypes.group.GetPendingAppliesResp>(`${config.groupServer}/group/apply/pending`);
            if (response.code === 200) {
                const decoded = decodeMainResponse(response, ApiTypes.group.GetPendingAppliesResp.decode);
                const resultApi = decoded.data?.data ?? [];
                const result = resultApi.map(r => r as unknown as GroupRequest);
                await cacheManager.setItems(ResourceType.GROUP_APPLY, result);
                resolvePromise!(result);
                return result;
            } else {
                console.error('[GroupService] fetchPendingApplies API error:', response.message);
                resolvePromise!([]);
                return [];
            }
        } catch (error) {
            console.error('[GroupService] fetchPendingApplies error:', error);
            rejectPromise!(error);
            throw error;
        } finally {
            this.pendingApplies.delete(key);
        }
    }

    // ==================== 内部 API 调用 ====================

    private async doFetchGroupsByIds(ids: number[]): Promise<ApiTypes.group.Group[]> {
        const params = ids.map(id => `group_id=${id}`).join('&');
        return this.doGroupRequest(`${config.groupServer}/group/info?${params}`);
    }

    private async doFetchGroupsByQuery(query: { name?: string; limit?: number; offset?: number }): Promise<ApiTypes.group.Group[]> {
        const params = new URLSearchParams();
        if (query.name) params.append('name_keyword', query.name);
        if (query.limit !== undefined) params.append('limit', query.limit.toString());
        if (query.offset !== undefined) params.append('offset', query.offset.toString());
        return this.doGroupRequest(`${config.groupServer}/group/info?${params.toString()}`);
    }

    private async doFetchGroupMembers(groupId: number): Promise<ApiTypes.group.GroupMember[]> {
        try {
            const response = await mainGet<ApiTypes.group.GetGroupMembersResp>(`${config.groupServer}/group/members?group_id=${groupId}`);
            if (response.code === 200) {
                const decoded = decodeMainResponse(response, ApiTypes.group.GetGroupMembersResp.decode);
                return decoded.data?.data ?? [];
            }
            console.error('[GroupService] API error:', response.message);
            return [];
        } catch (error) {
            console.error('[GroupService] Request error:', error);
            return [];
        }
    }

    private async doGroupRequest(url: string): Promise<ApiTypes.group.Group[]> {
        try {
            const response = await mainGet<ApiTypes.group.GetGroupResp>(url);
            if (response.code === 200) {
                const decoded = decodeMainResponse(response, ApiTypes.group.GetGroupResp.decode);
                return decoded.data?.data ?? [];
            }
            console.error('[GroupService] API error:', response.message);
            return [];
        } catch (error) {
            console.error('[GroupService] Request error:', error);
            return [];
        }
    }
}

export const groupService = new GroupService();