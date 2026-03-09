import { ResourceType, ResourceIdKeyMap, IpcChannels } from '../../src/types';
import { windowManager } from '../windows/windowManager';
import { config } from '../config';
import { LRUCache } from 'lru-cache';
import Store from 'electron-store';

// ─── 需要持久化到磁盘的资源类型 ─────────────────────────────────
const PERSIST_TYPES = new Set<ResourceType>([
    ResourceType.USER,
    ResourceType.GROUP,
    ResourceType.FRIEND,
    ResourceType.GROUP_JOINED,
    ResourceType.GROUP_MEMBER,
]);

// 磁盘存储的单条记录
interface DiskRecord {
    data: any;
    expiresAt: number;
}

/**
 * 缓存管理器
 * 内存 LRU + 磁盘 electron-store 双层缓存
 */
class CacheManager {
    // ─── 内存层 ──────────────────────────────────────────────────
    private caches: Map<ResourceType, LRUCache<number, { data: any; lastUpdated: number }>> = new Map();
    private userGroupIds: number[] = [];
    private initialized: boolean = false;

    // ─── 磁盘层 ──────────────────────────────────────────────────
    private diskStore: Store<Record<string, any>> | null = null;

    // Debounce 脏队列：key → DiskRecord
    private dirtyQueue: Map<string, DiskRecord | null> = new Map(); // null 表示待删除
    private flushTimer: ReturnType<typeof setTimeout> | null = null;
    private readonly FLUSH_DELAY_MS = 500;

    // ─── 磁盘 key 工具 ────────────────────────────────────────────
    private diskKey(type: ResourceType, id: number): string {
        return `${type}:${id}`;
    }

    // ==================== 初始化 ====================

    public init(): void {
        if (this.initialized) return;
        this.initialized = true;

        // 初始化磁盘存储
        this.diskStore = new Store({
            name: 'resource-cache',
            clearInvalidConfig: true,
        });

        // 初始化各类型内存缓存
        Object.values(ResourceType).forEach((type) => {
            this.caches.set(type, new LRUCache({
                max: config.maxCacheItems || 5000,
                ttl: config.cacheExpirationMs,
                updateAgeOnGet: false,
            }));
        });

        // 从磁盘恢复到内存
        this.restoreFromDisk();
    }

    /**
     * 从磁盘恢复未过期的缓存到内存
     */
    private restoreFromDisk(): void {
        if (!this.diskStore) return;

        const now = Date.now();
        const all = this.diskStore.store as Record<string, any>;

        // 恢复 GROUP_JOINED
        const savedGroupIds = all['__userGroupIds__'];
        if (Array.isArray(savedGroupIds)) {
            this.userGroupIds = savedGroupIds;
        }

        // 恢复普通资源
        const keysToDelete: string[] = [];

        for (const [key, record] of Object.entries(all)) {
            if (key === '__userGroupIds__') continue;

            const [typeStr, idStr] = key.split(':');
            const type = typeStr as ResourceType;
            const id = parseInt(idStr, 10);

            if (!PERSIST_TYPES.has(type) || isNaN(id)) continue;

            const diskRecord = record as DiskRecord;
            if (!diskRecord || !diskRecord.expiresAt) {
                keysToDelete.push(key);
                continue;
            }

            if (diskRecord.expiresAt <= now) {
                // 已过期，标记删除
                keysToDelete.push(key);
                continue;
            }

            // 未过期，回填内存
            const cache = this.caches.get(type);
            if (cache) {
                cache.set(id, {
                    data: diskRecord.data,
                    lastUpdated: diskRecord.expiresAt - config.cacheExpirationMs,
                });
            }
        }

        // 清理过期记录
        if (keysToDelete.length > 0) {
            keysToDelete.forEach((k) => this.diskStore!.delete(k));
        }

        console.log(`[CacheManager] Restored from disk, cleaned ${keysToDelete.length} expired entries`);
    }

    // ==================== 通用缓存方法 ====================

    /**
     * 获取单个资源（从缓存）
     */
    public getItem<T>(type: ResourceType, id: number): T | null {
        const cache = this.caches.get(type);
        const cached = cache?.get(id);

        // 检查过期
        if (cached && Date.now() - cached.lastUpdated > config.cacheExpirationMs) {
            cache?.delete(id);
            return null;
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

        ids.forEach((id) => {
            const cached = cache.get(id);
            if (cached) {
                if (Date.now() - cached.lastUpdated > config.cacheExpirationMs) {
                    cache.delete(id);
                    // 内存过期，尝试磁盘
                    const diskData = this.getFromDisk<T>(type, id);
                    if (diskData !== null) {
                        items.push(diskData);
                    } else {
                        missingIds.push(id);
                    }
                } else {
                    items.push(cached.data);
                }
            } else {
                // 内存 miss，尝试磁盘
                const diskData = this.getFromDisk<T>(type, id);
                if (diskData !== null) {
                    items.push(diskData);
                } else {
                    missingIds.push(id);
                }
            }
        });

        return { items, missingIds };
    }

    /**
     * 从磁盘读取单条记录，命中则回填内存
     */
    private getFromDisk<T>(type: ResourceType, id: number): T | null {
        if (!this.diskStore || !PERSIST_TYPES.has(type)) return null;

        const key = this.diskKey(type, id);
        const record = this.diskStore.get(key) as DiskRecord | undefined;
        if (!record || !record.expiresAt) return null;

        if (record.expiresAt <= Date.now()) {
            // 过期，删除
            this.diskStore.delete(key);
            return null;
        }

        // 回填内存
        const cache = this.caches.get(type);
        if (cache) {
            cache.set(id, {
                data: record.data,
                lastUpdated: record.expiresAt - config.cacheExpirationMs,
            });
        }

        return record.data as T;
    }

    /**
     * 设置单个资源（更新缓存）
     */
    public setItem<T extends Record<string, any>>(type: ResourceType, item: T): void {
        // GROUP_JOINED: 仅维护用户已加入群组 ID 列表
        if (type === ResourceType.GROUP_JOINED) {
            if (typeof item === 'number') {
                if (!this.userGroupIds.includes(item)) {
                    this.userGroupIds.push(item);
                }
                this.enqueueDiskWrite('__userGroupIds__', {
                    data: this.userGroupIds,
                    expiresAt: Date.now() + config.cacheExpirationMs,
                });
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
            if (existing && existing.data && Array.isArray(existing.data.members)) {
                const existingMembers = existing.data.members;
                const newMembers = (item as any).members;

                if (Array.isArray(newMembers)) {
                    const memberMap = new Map(existingMembers.map((m: any) => [m.user_id, m]));
                    newMembers.forEach((m: any) => {
                        memberMap.set(m.user_id, m);
                    });

                    const mergedItem = {
                        ...item,
                        members: Array.from(memberMap.values())
                    };

                    cache.set(id, { data: mergedItem, lastUpdated: Date.now() });
                    this.scheduleDiskWrite(type, id, mergedItem);
                    return;
                }
            }
        }

        const cache = this.caches.get(type);
        const idKey = ResourceIdKeyMap[type];
        if (!cache || !idKey) return;

        const id = item[idKey] as number;
        cache.set(id, { data: item, lastUpdated: Date.now() });
        this.scheduleDiskWrite(type, id, item);
    }

    /**
     * 批量设置资源
     */
    public setItems<T extends Record<string, any>>(type: ResourceType, items: T[]): void {
        items.forEach((item) => this.setItem(type, item));
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
            this.enqueueDiskWrite('__userGroupIds__', {
                data: this.userGroupIds,
                expiresAt: Date.now() + config.cacheExpirationMs,
            });
            return;
        }

        const cache = this.caches.get(type);
        cache?.delete(id);

        // 标记磁盘删除
        if (PERSIST_TYPES.has(type)) {
            this.enqueueDiskWrite(this.diskKey(type, id), null);
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
        this.enqueueDiskWrite('__userGroupIds__', {
            data: this.userGroupIds,
            expiresAt: Date.now() + config.cacheExpirationMs,
        });
    }

    /**
     * 清除缓存
     */
    public clearCache(type?: ResourceType): void {
        if (type) {
            this.caches.get(type)?.clear();
            // 清磁盘中该类型的所有记录
            this.clearDiskByType(type);
        } else {
            this.caches.forEach((cache) => cache.clear());
            this.userGroupIds = [];
            this.diskStore?.clear();
        }
    }

    /**
     * 广播资源更新到所有渲染进程
     */
    public broadcastUpdate<T>(type: ResourceType, items: T[]): void {
        windowManager.broadcastMessage(IpcChannels.RESOURCE_UPDATE, { type, items });
    }

    // ==================== 磁盘写入 ====================

    /**
     * 将写入/删除操作推入脏队列，debounce 刷盘
     */
    private enqueueDiskWrite(key: string, record: DiskRecord | null): void {
        this.dirtyQueue.set(key, record);
        this.scheduleFlush();
    }

    /**
     * 便捷方法：安排持久化写入
     */
    private scheduleDiskWrite(type: ResourceType, id: number, data: any): void {
        if (!PERSIST_TYPES.has(type)) return;
        this.enqueueDiskWrite(this.diskKey(type, id), {
            data,
            expiresAt: Date.now() + config.cacheExpirationMs,
        });
    }

    /**
     * 安排 debounce 刷盘
     */
    private scheduleFlush(): void {
        if (this.flushTimer) return; // 已有定时器，等合并
        this.flushTimer = setTimeout(() => {
            this.flushTimer = null;
            this.flushToDisk();
        }, this.FLUSH_DELAY_MS);
    }

    /**
     * 立即将脏队列写入磁盘（退出时调用）
     */
    public flushToDisk(): void {
        if (!this.diskStore || this.dirtyQueue.size === 0) return;

        for (const [key, record] of this.dirtyQueue) {
            if (record === null) {
                this.diskStore.delete(key);
            } else {
                this.diskStore.set(key, record);
            }
        }

        this.dirtyQueue.clear();

        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }
    }

    /**
     * 清除磁盘中指定类型的所有记录
     */
    private clearDiskByType(type: ResourceType): void {
        if (!this.diskStore || !PERSIST_TYPES.has(type)) return;

        if (type === ResourceType.GROUP_JOINED) {
            this.diskStore.delete('__userGroupIds__');
            return;
        }

        const prefix = `${type}:`;
        const all = this.diskStore.store as Record<string, any>;
        for (const key of Object.keys(all)) {
            if (key.startsWith(prefix)) {
                this.diskStore.delete(key);
            }
        }
    }
}

export const cacheManager = new CacheManager();
