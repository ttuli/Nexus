import { authManager } from './authManager';
import { tokenManager } from './tokenManager';
import { cacheManager } from './cacheManager';
import { setupIpcHandlers } from './ipcHandlers';
import { wsManager, setupWsIpcHandlers, setupWsEventForwarding } from '@/electron/websocket';
import { Group, ResourceType } from '@/src/types';

/**
 * 资源管理器（主入口）
 * 统一初始化和导出各模块
 */
class ResourceManager {
    private initialized: boolean = false;

    public init(): void {
        if (this.initialized) return;
        this.initialized = true;

        // 初始化各模块
        authManager.init();
        cacheManager.init();

        // 初始化 WebSocket 模块
        wsManager.init();
        setupWsIpcHandlers();
        setupWsEventForwarding();

        // 设置 IPC 处理器
        setupIpcHandlers();
    }

    // ==================== Auth 代理方法 ====================

    public setStoreRefreshToken(storeRefreshToken: boolean): void {
        tokenManager.setStoreRefreshToken(storeRefreshToken);
    }

    public cleanout(): void {
        tokenManager.cleanout();
        cacheManager.clearCache();
    }


    public getCurrentUserID(): number {
        return tokenManager.getCurrentUserID();
    }

    // ==================== Cache 代理方法 ====================

    public getItem<T>(type: ResourceType, id: number): T | null {
        return cacheManager.getItem<T>(type, id);
    }

    public getItems<T>(type: ResourceType, ids: number[]): { items: T[]; missingIds: number[] } {
        return cacheManager.getItems<T>(type, ids);
    }

    public setItem<T extends Record<string, any>>(type: ResourceType, item: T): void {
        cacheManager.setItem(type, item);
    }

    public setItems<T extends Record<string, any>>(type: ResourceType, items: T[]): void {
        cacheManager.setItemsAndBroadcast(type, items);
    }

    public deleteItem(type: ResourceType, id: number): void {
        cacheManager.deleteItem(type, id);
    }

    public clearCache(type?: ResourceType): void {
        cacheManager.clearCache(type);
    }

    // ==================== Group 便捷方法 ====================

    public getGroupInfo(groupId: number): Group | null {
        return this.getItem<Group>(ResourceType.GROUP, groupId);
    }

    public getGroupsInfo(groupIds: number[]): Group[] {
        const { items } = this.getItems<Group>(ResourceType.GROUP, groupIds);
        return items;
    }

    public setGroupInfo(group: Group): void {
        this.setItem(ResourceType.GROUP, group);
    }

    public setGroupsInfo(groups: Group[]): void {
        this.setItems(ResourceType.GROUP, groups);
    }
}

export const resourceManager = new ResourceManager();

// 重新导出各模块
export { authManager } from './authManager';
export { tokenManager } from './tokenManager';
export { cacheManager } from './cacheManager';
export { userService } from './userManager';
export { friendService } from './friendManager';

