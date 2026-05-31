import { ResourceType, ResourceIdKeyMap, IpcChannels, GroupMembersWrapper } from '../../src/types';
import { windowManager } from '../windows/windowManager';
import { Main_Config as config } from '../../src/config/constants';
import { LRUCache } from 'lru-cache';
import {
    userStore,
    groupStore,
    groupMemberStore,
    kvCache,
    closeDb
} from '../db';

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
 */
class CacheManager {
    // ─── 内存层 ──────────────────────────────────────────────────
    private caches: Map<ResourceType, LRUCache<number, { data: any; lastUpdated: number }>> = new Map();
    private userGroupIds: number[] = [];
    private initialized: boolean = false;

    // ==================== 初始化 ====================

    public init(): void {
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

        // 清理 SQLite 中的过期数据
        this.cleanExpiredDiskCache();

        // 从 SQLite 恢复 userGroupIds
        try {
            this.userGroupIds = kvCache.getAllIds('group_joined');
            console.log(`[CacheManager] Restored ${this.userGroupIds.length} joined groups from SQLite`);
        } catch (err) {
            console.error('[CacheManager] Failed to restore userGroupIds from SQLite:', err);
        }
    }

    /**
     * 清理所有过期记录
     */
    private cleanExpiredDiskCache(): void {
        try {
            userStore.deleteExpired();
            groupStore.deleteExpired();
            groupMemberStore.deleteExpired();
            kvCache.deleteExpired();
            console.log('[CacheManager] SQLite expired entries cleaned');
        } catch (err) {
            console.error('[CacheManager] Failed to clean expired entries:', err);
        }
    }

    // ==================== 通用缓存方法 ====================

    /**
     * 获取单个资源（从缓存）
     */
    public getItem<T>(type: ResourceType, id: number): T | null {
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
    public getItems<T>(type: ResourceType, ids: number[]): { items: T[]; missingIds: number[] } {
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
                        const res = userStore.getMany(dbQueryIds);
                        foundInDb = res.found;
                        missingInDb = res.missing;
                        break;
                    }
                    case ResourceType.GROUP: {
                        const res = groupStore.getMany(dbQueryIds);
                        foundInDb = res.found;
                        missingInDb = res.missing;
                        break;
                    }
                    case ResourceType.GROUP_MEMBER: {
                        // GROUP_MEMBER 通常按 group_id 批量获取成员列表
                        dbQueryIds.forEach((groupId) => {
                            const members = groupMemberStore.getByGroup(groupId);
                            if (members.length > 0) {
                                foundInDb.push({ group_id: groupId, members });
                            } else {
                                missingInDb.push(groupId);
                            }
                        });
                        break;
                    }
                    case ResourceType.FRIEND: {
                        const res = kvCache.getMany<any>('friend', dbQueryIds);
                        foundInDb = res.found;
                        missingInDb = res.missing;
                        break;
                    }
                    case ResourceType.GROUP_JOINED: {
                        const res = kvCache.getMany<any>('group_joined', dbQueryIds);
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
    private getFromDisk<T>(type: ResourceType, id: number): T | null {
        if (!PERSIST_TYPES.has(type)) return null;

        let data: any = null;
        try {
            switch (type) {
                case ResourceType.USER:
                    data = userStore.get(id);
                    break;
                case ResourceType.GROUP:
                    data = groupStore.get(id);
                    break;
                case ResourceType.GROUP_MEMBER: {
                    const members = groupMemberStore.getByGroup(id);
                    if (members.length > 0) {
                        data = { group_id: id, members } as GroupMembersWrapper;
                    }
                    break;
                }
                case ResourceType.FRIEND:
                    data = kvCache.get('friend', id);
                    break;
                case ResourceType.GROUP_JOINED:
                    data = kvCache.get('group_joined', id);
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
    public setItem<T extends Record<string, any>>(type: ResourceType, item: T): void {
        const expiresAt = Date.now() + config.cacheExpirationMs;

        // GROUP_JOINED: 仅维护用户已加入群组 ID 列表
        if (type === ResourceType.GROUP_JOINED) {
            if (typeof item === 'number') {
                if (!this.userGroupIds.includes(item)) {
                    this.userGroupIds.push(item);
                }
                try {
                    kvCache.set('group_joined', item, {}, expiresAt);
                } catch (err) {
                    console.error('[CacheManager] Failed to write group_joined to SQLite:', err);
                }
            } else {
                console.error('GROUP_JOINED must be a number');
            }
            return;
        }

        if (type === ResourceType.GROUP_MEMBER) {
            const cache = this.caches.get(type);
            const idKey = ResourceIdKeyMap[type];
            if (!cache || !idKey) return;

            const id = item[idKey] as number;
            const existing = cache.get(id);

            // 如果已有缓存，进行合并
            let mergedItem = item;
            if (existing && existing.data && Array.isArray(existing.data.members)) {
                const existingMembers = existing.data.members;
                const newMembers = (item as any).members;

                if (Array.isArray(newMembers)) {
                    const memberMap = new Map(existingMembers.map((m: any) => [m.user_id, m]));
                    newMembers.forEach((m: any) => {
                        memberMap.set(m.user_id, m);
                    });

                    mergedItem = {
                        ...item,
                        members: Array.from(memberMap.values())
                    } as any;
                }
            }

            cache.set(id, { data: mergedItem, lastUpdated: Date.now() });

            // 写入 SQLite
            try {
                const members = (mergedItem as any).members;
                if (Array.isArray(members)) {
                    groupMemberStore.upsertMany(members, expiresAt);
                }
            } catch (err) {
                console.error('[CacheManager] Failed to write group members to SQLite:', err);
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
                    userStore.set(item as any, expiresAt);
                    break;
                case ResourceType.GROUP:
                    groupStore.set(item as any, expiresAt);
                    break;
                case ResourceType.FRIEND:
                    kvCache.set('friend', id, item, expiresAt);
                    break;
            }
        } catch (err) {
            console.error(`[CacheManager] Failed to write ${type}:${id} to SQLite:`, err);
        }
    }

    /**
     * 批量设置资源
     */
    public setItems<T extends Record<string, any>>(type: ResourceType, items: T[]): void {
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
            cache.set(id, { data: item, lastUpdated: Date.now() });
        });

        // 2. 批量写入 SQLite (使用事务，性能好)
        if (!PERSIST_TYPES.has(type)) return;

        try {
            switch (type) {
                case ResourceType.USER:
                    userStore.setMany(items as any[], expiresAt);
                    break;
                case ResourceType.GROUP:
                    groupStore.setMany(items as any[], expiresAt);
                    break;
                case ResourceType.GROUP_MEMBER: {
                    const allMembers: any[] = [];
                    items.forEach((wrapper: any) => {
                        if (wrapper && Array.isArray(wrapper.members)) {
                            allMembers.push(...wrapper.members);
                        }
                    });
                    if (allMembers.length > 0) {
                        groupMemberStore.upsertMany(allMembers, expiresAt);
                    }
                    break;
                }
                case ResourceType.FRIEND: {
                    const kvItems = items.map(item => {
                        const idKey = ResourceIdKeyMap[type]!;
                        return { id: item[idKey] as number, data: item };
                    });
                    kvCache.setMany('friend', kvItems, expiresAt);
                    break;
                }
                case ResourceType.GROUP_JOINED: {
                    const kvItems = items.map(item => {
                        const id = typeof item === 'number' ? item : item[ResourceIdKeyMap[type]!] as number;
                        return { id, data: {} };
                    });
                    kvCache.setMany('group_joined', kvItems, expiresAt);
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
    public setItemsAndBroadcast<T extends Record<string, any>>(type: ResourceType, items: T[]): void {
        this.setItems(type, items);
        if (items.length > 0) {
            this.broadcastUpdate(type, items);
        }
    }

    /**
     * 删除资源
     */
    public deleteItem(type: ResourceType, id: number): void {
        // GROUP_JOINED: 从用户群组列表中移除
        if (type === ResourceType.GROUP_JOINED) {
            this.userGroupIds = this.userGroupIds.filter(gid => gid !== id);
            try {
                kvCache.delete('group_joined', id);
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
                        userStore.delete(id);
                        break;
                    case ResourceType.GROUP:
                        groupStore.delete(id);
                        break;
                    case ResourceType.GROUP_MEMBER:
                        // 删除该群的所有成员缓存
                        groupMemberStore.deleteByGroup(id);
                        break;
                    case ResourceType.FRIEND:
                        kvCache.delete('friend', id);
                        break;
                }
            } catch (err) {
                console.error(`[CacheManager] Failed to delete ${type}:${id} from SQLite:`, err);
            }
        }
    }

    /**
     * 获取用户加入的群组 ID 列表
     */
    public getUserGroupIds(): number[] {
        return this.userGroupIds;
    }

    /**
     * 设置用户加入的群组 ID 列表（初始全量同步）
     */
    public setUserGroupIds(ids: number[]): void {
        this.userGroupIds = [...ids];
        const expiresAt = Date.now() + config.cacheExpirationMs;

        try {
            // 重置 group_joined 表
            kvCache.clear('group_joined');
            const items = ids.map(id => ({ id, data: {} }));
            kvCache.setMany('group_joined', items, expiresAt);
        } catch (err) {
            console.error('[CacheManager] Failed to batch write userGroupIds to SQLite:', err);
        }
    }

    /**
     * 清除缓存
     */
    public clearCache(type?: ResourceType): void {
        if (type) {
            this.caches.get(type)?.clear();
            try {
                switch (type) {
                    case ResourceType.USER:
                        userStore.clear();
                        break;
                    case ResourceType.GROUP:
                        groupStore.clear();
                        break;
                    case ResourceType.GROUP_MEMBER:
                        groupMemberStore.clear();
                        break;
                    case ResourceType.FRIEND:
                        kvCache.clear('friend');
                        break;
                    case ResourceType.GROUP_JOINED:
                        kvCache.clear('group_joined');
                        this.userGroupIds = [];
                        break;
                }
            } catch (err) {
                console.error(`[CacheManager] Failed to clear disk cache for ${type}:`, err);
            }
        } else {
            this.caches.forEach((cache) => cache.clear());
            this.userGroupIds = [];
            try {
                userStore.clear();
                groupStore.clear();
                groupMemberStore.clear();
                kvCache.clear();
            } catch (err) {
                console.error('[CacheManager] Failed to clear all SQLite tables:', err);
            }
        }
    }

    /**
     * 广播资源更新到所有渲染进程
     */
    public broadcastUpdate<T>(type: ResourceType, items: T[]): void {
        windowManager.broadcastMessage(IpcChannels.RESOURCE_UPDATE, { type, items });
    }

    // ==================== 磁盘写入兼容方法 ====================

    /**
     * 保持与 main.ts 签名的兼容，在此处安全关闭 SQLite 连接
     */
    public flushToDisk(): void {
        try {
            closeDb();
            console.log('[CacheManager] SQLite connection closed successfully on app quit.');
        } catch (err) {
            console.error('[CacheManager] Error closing SQLite connection on app quit:', err);
        }
    }
}

export const cacheManager = new CacheManager();
