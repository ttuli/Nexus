import { ResourceType, ResourceIdKeyMap, IpcChannels, GroupMembersWrapper } from '@shared/types';
import { windowManager } from '@/electron/windows/windowManager';
import { Main_Config as config } from '@shared/config/constants';
import { LRUCache } from 'lru-cache';
import {
    userStore,
    groupStore,
    groupMemberStore,
    kvCache,
    openSharedDb,
    openDb
} from '@/electron/db';

// ─── 需要持久化到磁盘的资源类型 ─────────────────────────────────
const PERSIST_TYPES = new Set<ResourceType>([
    ResourceType.USER,
    ResourceType.GROUP,
    ResourceType.FRIEND,
    ResourceType.GROUP_JOINED,
    ResourceType.GROUP_MEMBER,
]);

/**
 * 缓存管理器
 * 内存 LRU + SQLite 双层缓存
 * 注意：所有涉及 SQLite 的方法均为 async
 */
class CacheManager {
    // ─── 内存层 ──────────────────────────────────────────────────
    private caches: Map<ResourceType, LRUCache<number, { data: any; lastUpdated: number }>> = new Map();
    private userGroupIds: number[] = [];
    private initialized: boolean = false;

    // ==================== 初始化 ====================

    public async init(): Promise<void> {
        if (this.initialized) return;
        this.initialized = true;

        // 初始化各类型内存缓存
        Object.values(ResourceType).forEach((type) => {
            this.caches.set(type, new LRUCache({
                max: config.maxCacheItems || 5000,
                ttl: config.cacheExpirationMs,
                updateAgeOnGet: false,
            }));
        });

        // 打开共享数据库（app 启动时调用一次，生命周期与 app 相同）
        await openSharedDb();
    }

    /**
     * 登录成功后调用：打开用户数据库并执行数据库相关的初始化
     * @param userId 当前登录用户 ID
     */
    public async onLogin(userId: number): Promise<void> {
        // 打开（或切换至）该用户专属的数据库文件
        await openDb(userId);

        // 清理 SQLite 中的过期数据
        await this.cleanExpiredDiskCache();

        // 从 SQLite 恢复 userGroupIds
        try {
            this.userGroupIds = await kvCache.getAllIds('group_joined');
            console.log(`[CacheManager] Restored ${this.userGroupIds.length} joined groups from SQLite`);
        } catch (err) {
            console.error('[CacheManager] Failed to restore userGroupIds from SQLite:', err);
        }
    }

    /**
     * 清理所有过期记录
     */
    private async cleanExpiredDiskCache(): Promise<void> {
        try {
            await userStore.deleteExpired();
            await groupStore.deleteExpired();
            await groupMemberStore.deleteExpired();
            await kvCache.deleteExpired();
            console.log('[CacheManager] SQLite expired entries cleaned');
        } catch (err) {
            console.error('[CacheManager] Failed to clean expired entries:', err);
        }
    }

    // ==================== 通用缓存方法 ====================

    /**
     * 获取单个资源（从缓存）
     */
    public async getItem<T>(type: ResourceType, id: number): Promise<T | null> {
        const cache = this.caches.get(type);
        const cached = cache?.get(id);

        // 检查内存过期
        if (cached && Date.now() - cached.lastUpdated > config.cacheExpirationMs) {
            cache?.delete(id);
            // 内存过期，尝试从磁盘重新加载
            return this.getFromDisk<T>(type, id);
        }

        if (cached) return cached.data as T;

        // 内存 miss → 查磁盘
        return this.getFromDisk<T>(type, id);
    }

    /**
     * 批量获取资源（从缓存）
     * 返回找到的资源和缺失的 ID
     */
    public async getItems<T>(type: ResourceType, ids: number[]): Promise<{ items: T[]; missingIds: number[] }> {
        const cache = this.caches.get(type);
        if (!cache) return { items: [], missingIds: ids };

        const items: T[] = [];
        const missingIds: number[] = [];
        const dbQueryIds: number[] = [];

        // 1. 检查内存缓存
        ids.forEach((id) => {
            const cached = cache.get(id);
            if (cached) {
                if (Date.now() - cached.lastUpdated > config.cacheExpirationMs) {
                    cache.delete(id);
                    dbQueryIds.push(id);
                } else {
                    items.push(cached.data);
                }
            } else {
                dbQueryIds.push(id);
            }
        });

        // 2. 批量查 SQLite
        if (dbQueryIds.length > 0 && PERSIST_TYPES.has(type)) {
            let foundInDb: any[] = [];
            let missingInDb: number[] = [];

            try {
                switch (type) {
                    case ResourceType.USER: {
                        const res = await userStore.getMany(dbQueryIds);
                        foundInDb = res.found;
                        missingInDb = res.missing;
                        break;
                    }
                    case ResourceType.GROUP: {
                        const res = await groupStore.getMany(dbQueryIds);
                        foundInDb = res.found;
                        missingInDb = res.missing;
                        break;
                    }
                    case ResourceType.GROUP_MEMBER: {
                        // GROUP_MEMBER 通常按 group_id 批量获取成员列表
                        for (const groupId of dbQueryIds) {
                            const members = await groupMemberStore.getByGroup(groupId);
                            if (members.length > 0) {
                                foundInDb.push({ group_id: groupId, members });
                            } else {
                                missingInDb.push(groupId);
                            }
                        }
                        break;
                    }
                    case ResourceType.FRIEND: {
                        const res = await kvCache.getMany<any>('friend', dbQueryIds);
                        foundInDb = res.found;
                        missingInDb = res.missing;
                        break;
                    }
                    case ResourceType.GROUP_JOINED: {
                        const res = await kvCache.getMany<any>('group_joined', dbQueryIds);
                        foundInDb = res.found;
                        missingInDb = res.missing;
                        break;
                    }
                    default:
                        missingInDb = dbQueryIds;
                }

                // 回填内存并添加到结果中
                foundInDb.forEach((data) => {
                    const idKey = ResourceIdKeyMap[type];
                    if (idKey) {
                        const id = data[idKey] as number;
                        cache.set(id, { data, lastUpdated: Date.now() });
                        items.push(data);
                    }
                });

                missingIds.push(...missingInDb);
            } catch (err) {
                console.error(`[CacheManager] Failed to batch get ${type} from SQLite:`, err);
                missingIds.push(...dbQueryIds);
            }
        } else {
            missingIds.push(...dbQueryIds);
        }

        return { items, missingIds };
    }

    /**
     * 从磁盘读取单条记录，命中则回填内存
     */
    private async getFromDisk<T>(type: ResourceType, id: number): Promise<T | null> {
        if (!PERSIST_TYPES.has(type)) return null;

        let data: any = null;
        try {
            switch (type) {
                case ResourceType.USER:
                    data = await userStore.get(id);
                    break;
                case ResourceType.GROUP:
                    data = await groupStore.get(id);
                    break;
                case ResourceType.GROUP_MEMBER: {
                    const members = await groupMemberStore.getByGroup(id);
                    if (members.length > 0) {
                        data = { group_id: id, members } as GroupMembersWrapper;
                    }
                    break;
                }
                case ResourceType.FRIEND:
                    data = await kvCache.get('friend', id);
                    break;
                case ResourceType.GROUP_JOINED:
                    data = await kvCache.get('group_joined', id);
                    break;
            }
        } catch (err) {
            console.error(`[CacheManager] Failed to read ${type}:${id} from SQLite:`, err);
            return null;
        }

        if (data === null) return null;

        // 回填内存
        const cache = this.caches.get(type);
        if (cache) {
            cache.set(id, {
                data,
                lastUpdated: Date.now(),
            });
        }

        return data as T;
    }

    /**
     * 设置单个资源（更新缓存）
     */
    public async setItem<T extends Record<string, any>>(type: ResourceType, item: T): Promise<void> {
        const expiresAt = Date.now() + config.cacheExpirationMs;

        // GROUP_JOINED: 仅维护用户已加入群组 ID 列表
        if (type === ResourceType.GROUP_JOINED) {
            if (typeof item === 'number') {
                if (!this.userGroupIds.includes(item)) {
                    this.userGroupIds.push(item);
                }
                try {
                    await kvCache.set('group_joined', item, {}, expiresAt);
                } catch (err) {
                    console.error('[CacheManager] Failed to write group_joined to SQLite:', err);
                }
            } else {
                console.error('GROUP_JOINED must be a number');
            }
            return;
        }

        if (type === ResourceType.GROUP_MEMBER) {
            // 写入 SQLite (利用 groupMemberStore 的 upsert 特性)
            try {
                const members = (item as any).members;
                if (Array.isArray(members)) {
                    await groupMemberStore.upsertMany(members, expiresAt);
                }
            } catch (err) {
                console.error('[CacheManager] Failed to write group members to SQLite:', err);
            }
            // 清除内存缓存，下次读取时自动从 SQLite 中获取最新合并后的全量数据
            const idKey = ResourceIdKeyMap[type];
            if (idKey) {
                this.caches.get(type)?.delete(item[idKey] as number);
            }
            return;
        }

        const cache = this.caches.get(type);
        const idKey = ResourceIdKeyMap[type];
        if (!cache || !idKey) return;

        const id = item[idKey] as number;
        cache.set(id, { data: item, lastUpdated: Date.now() });

        // 写入 SQLite
        try {
            switch (type) {
                case ResourceType.USER:
                    await userStore.set(item as any, expiresAt);
                    break;
                case ResourceType.GROUP:
                    await groupStore.set(item as any, expiresAt);
                    break;
                case ResourceType.FRIEND:
                    await kvCache.set('friend', id, item, expiresAt);
                    break;
            }
        } catch (err) {
            console.error(`[CacheManager] Failed to write ${type}:${id} to SQLite:`, err);
        }
    }

    /**
     * 批量设置资源
     */
    public async setItems<T extends Record<string, any>>(type: ResourceType, items: T[]): Promise<void> {
        if (items.length === 0) return;

        const expiresAt = Date.now() + config.cacheExpirationMs;

        // 1. 更新内存缓存
        items.forEach((item) => {
            if (type === ResourceType.GROUP_JOINED) {
                if (typeof item === 'number') {
                    if (!this.userGroupIds.includes(item)) {
                        this.userGroupIds.push(item);
                    }
                }
                return;
            }

            const cache = this.caches.get(type);
            const idKey = ResourceIdKeyMap[type];
            if (!cache || !idKey) return;

            const id = item[idKey] as number;

            if (type === ResourceType.GROUP_MEMBER) {
                // GROUP_MEMBER 需要在 SQLite 中进行合并，直接清除内存缓存
                cache.delete(id);
            } else {
                cache.set(id, { data: item, lastUpdated: Date.now() });
            }
        });

        // 2. 批量写入 SQLite (使用事务，性能好)
        if (!PERSIST_TYPES.has(type)) return;

        try {
            switch (type) {
                case ResourceType.USER:
                    await userStore.setMany(items as any[], expiresAt);
                    break;
                case ResourceType.GROUP:
                    await groupStore.setMany(items as any[], expiresAt);
                    break;
                case ResourceType.GROUP_MEMBER: {
                    const allMembers: any[] = [];
                    items.forEach((wrapper: any) => {
                        if (wrapper && Array.isArray(wrapper.members)) {
                            allMembers.push(...wrapper.members);
                        }
                    });
                    if (allMembers.length > 0) {
                        await groupMemberStore.upsertMany(allMembers, expiresAt);
                    }
                    break;
                }
                case ResourceType.FRIEND: {
                    const kvItems = items.map(item => {
                        const idKey = ResourceIdKeyMap[type]!;
                        return { id: item[idKey] as number, data: item };
                    });
                    await kvCache.setMany('friend', kvItems, expiresAt);
                    break;
                }
                case ResourceType.GROUP_JOINED: {
                    const kvItems = items.map(item => {
                        const id = typeof item === 'number' ? item : item[ResourceIdKeyMap[type]!] as number;
                        return { id, data: {} };
                    });
                    await kvCache.setMany('group_joined', kvItems, expiresAt);
                    break;
                }
            }
        } catch (err) {
            console.error(`[CacheManager] Failed to batch write ${type} to SQLite:`, err);
        }
    }

    /**
     * 批量设置资源并广播更新
     */
    public async setItemsAndBroadcast<T extends Record<string, any>>(type: ResourceType, items: T[]): Promise<void> {
        await this.setItems(type, items);
        if (items.length > 0) {
            this.broadcastUpdate(type, items);
        }
    }

    /**
     * 删除资源
     */
    public async deleteItem(type: ResourceType, id: number): Promise<void> {
        // GROUP_JOINED: 从用户群组列表中移除
        if (type === ResourceType.GROUP_JOINED) {
            this.userGroupIds = this.userGroupIds.filter(gid => gid !== id);
            try {
                await kvCache.delete('group_joined', id);
            } catch (err) {
                console.error('[CacheManager] Failed to delete group_joined from SQLite:', err);
            }
            return;
        }

        const cache = this.caches.get(type);
        cache?.delete(id);

        // 从 SQLite 删除
        if (PERSIST_TYPES.has(type)) {
            try {
                switch (type) {
                    case ResourceType.USER:
                        await userStore.delete(id);
                        break;
                    case ResourceType.GROUP:
                        await groupStore.delete(id);
                        break;
                    case ResourceType.GROUP_MEMBER:
                        // 删除该群的所有成员缓存
                        await groupMemberStore.deleteByGroup(id);
                        break;
                    case ResourceType.FRIEND:
                        await kvCache.delete('friend', id);
                        break;
                }
            } catch (err) {
                console.error(`[CacheManager] Failed to delete ${type}:${id} from SQLite:`, err);
            }
        }
    }

    /**
     * 删除某群的指定成员缓存（群操作通知同步用）
     * @param userIds 为空数组时删除该群全部成员缓存
     */
    public async deleteGroupMembers(groupId: number, userIds: number[]): Promise<void> {
        // 先失效内存，避免读到删除前的旧列表
        this.caches.get(ResourceType.GROUP_MEMBER)?.delete(groupId);
        try {
            if (userIds.length === 0) {
                await groupMemberStore.deleteByGroup(groupId);
            } else {
                await groupMemberStore.deleteMany(groupId, userIds);
            }
        } catch (err) {
            console.error(`[CacheManager] Failed to delete group members of ${groupId}:`, err);
        }
    }

    /**
     * 以服务端全量成员列表替换某群缓存（全量拉取后调用，可清掉已退群成员的残留行）
     */
    public async replaceGroupMembers(groupId: number, members: any[]): Promise<void> {
        this.caches.get(ResourceType.GROUP_MEMBER)?.delete(groupId);
        try {
            await groupMemberStore.replaceGroup(groupId, members, Date.now() + config.cacheExpirationMs);
        } catch (err) {
            console.error(`[CacheManager] Failed to replace group members of ${groupId}:`, err);
        }
    }

    /**
     * 获取用户加入的群组 ID 列表（同步，来自内存）
     */
    public getUserGroupIds(): number[] {
        return this.userGroupIds;
    }

    /**
     * 设置用户加入的群组 ID 列表（初始全量同步）
     */
    public async setUserGroupIds(ids: number[]): Promise<void> {
        this.userGroupIds = [...ids];
        const expiresAt = Date.now() + config.cacheExpirationMs;

        try {
            // 重置 group_joined 表
            await kvCache.clear('group_joined');
            const items = ids.map(id => ({ id, data: {} }));
            await kvCache.setMany('group_joined', items, expiresAt);
        } catch (err) {
            console.error('[CacheManager] Failed to batch write userGroupIds to SQLite:', err);
        }
    }

    /**
     * 清理纯内存缓存（切换账号时调用，防止数据串改）
     */
    public clearMemory(): void {
        this.caches.forEach((cache) => cache.clear());
        this.userGroupIds = [];
    }

    /**
     * 广播资源更新到所有渲染进程
     */
    public broadcastUpdate<T>(type: ResourceType, items: T[]): void {
        windowManager.broadcastMessage(IpcChannels.RESOURCE_UPDATE, { type, items });
    }
}

export const cacheManager = new CacheManager();
