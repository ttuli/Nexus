import { ResourceType, ResourceIdKeyMap, IpcChannels } from '../../src/types';
import { windowManager } from '../windows/windowManager';
import { config } from '../config';
import { LRUCache } from 'lru-cache';

/**
 * 缓存管理器
 * 负责通用资源缓存的读写操作
 */
class CacheManager {
    // 通用缓存结构: 采用 LRU Cache 限制内存持续增长
    private caches: Map<ResourceType, LRUCache<number, { data: any; lastUpdated: number }>> = new Map();

    // 用户加入的群组 ID 列表
    private userGroupIds: number[] = [];

    private initialized: boolean = false;

    public init(): void {
        if (this.initialized) return;
        this.initialized = true;

        // 初始化各类型缓存
        Object.values(ResourceType).forEach((type) => {
            this.caches.set(type, new LRUCache({
                max: config.maxCacheItems || 5000,
                ttl: config.cacheExpirationMs,
                updateAgeOnGet: false, // 遵循原逻辑，不因被读取而延长生命周期
            }));
        });
    }

    // ==================== 通用缓存方法 ====================

    /**
     * 获取单个资源（从缓存）
     */
    public getItem<T>(type: ResourceType, id: number): T | null {
        const cache = this.caches.get(type);
        const cached = cache?.get(id);

        // 检查过期 (LRUCache 提供 ttl 机制，但为兼容原逻辑保守起见保留手动判断)
        if (cached && Date.now() - cached.lastUpdated > config.cacheExpirationMs) {
            cache?.delete(id);
            return null;
        }

        return cached?.data ?? null;
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
                // 检查过期
                if (Date.now() - cached.lastUpdated > config.cacheExpirationMs) {
                    cache.delete(id);
                    missingIds.push(id);
                } else {
                    items.push(cached.data);
                }
            } else {
                missingIds.push(id);
            }
        });

        return { items, missingIds };
    }

    /**
     * 设置单个资源（更新缓存）
     */
    public setItem<T extends Record<string, any>>(type: ResourceType, item: T): void {
        // GROUP_JOINED: 仅维护用户已加入群组 ID 列表，群组详情由 GROUP 类型独立管理
        if (type === ResourceType.GROUP_JOINED) {
            const idKey = ResourceIdKeyMap[type];
            const ids = Array.isArray(item) ? (item as any[]).map(i => i[idKey] as number) : [item[idKey] as number];
            ids.forEach(id => {
                if (!this.userGroupIds.includes(id)) {
                    this.userGroupIds.push(id);
                }
            });
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
                    // 使用 Map 进行合并 (user_id 为 key)
                    const memberMap = new Map(existingMembers.map((m: any) => [m.user_id, m]));
                    newMembers.forEach((m: any) => {
                        memberMap.set(m.user_id, m);
                    });

                    // 创建新的完整数据对象，不修改传入的 item (保证 broadcast 发送的是增量)
                    const mergedItem = {
                        ...item,
                        members: Array.from(memberMap.values())
                    };

                    cache.set(id, { data: mergedItem, lastUpdated: Date.now() });
                    return;
                }
            }
        }

        const cache = this.caches.get(type);
        const idKey = ResourceIdKeyMap[type];
        if (!cache || !idKey) return;

        const id = item[idKey] as number;
        cache.set(id, { data: item, lastUpdated: Date.now() });
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
        // GROUP_JOINED: 从用户群组列表中移除，并同步删除 GROUP 缓存
        if (type === ResourceType.GROUP_JOINED) {
            this.userGroupIds = this.userGroupIds.filter(gid => gid !== id);
            const groupCache = this.caches.get(ResourceType.GROUP);
            groupCache?.delete(id);
            return;
        }

        const cache = this.caches.get(type);
        cache?.delete(id);
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
    }

    /**
     * 清除缓存
     */
    public clearCache(type?: ResourceType): void {
        if (type) {
            this.caches.get(type)?.clear();
        } else {
            this.caches.forEach((cache) => cache.clear());
            this.userGroupIds = [];
        }
    }

    /**
     * 广播资源更新到所有渲染进程
     */
    public broadcastUpdate<T>(type: ResourceType, items: T[]): void {
        windowManager.broadcastMessage(IpcChannels.RESOURCE_UPDATE, { type, items });
    }
}

export const cacheManager = new CacheManager();
