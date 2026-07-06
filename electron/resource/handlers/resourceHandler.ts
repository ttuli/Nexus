import { ipcMain } from 'electron';
import { cacheManager } from '@/electron/resource/cacheManager';
import { userService } from '@/electron/resource/userManager';
import { groupService } from '@/electron/resource/groupManager';
import { ResourceType } from '@shared/types/resourceCache';
import { IpcChannels } from '@shared/types/ipc';

import { UpdateAction } from '@shared/types/common';

/**
 * 通用资源缓存 IPC 处理器
 */
export function setupResourceHandlers(): void {
    ipcMain.handle(IpcChannels.RESOURCE_GET, async (_event, type: ResourceType, ids: number[], forceUpdate: boolean = false) => {
        try {
            // For USER type, support fetching missing items from API
            if (type === ResourceType.USER) {
                const users = await userService.fetchUsersByIds(ids, forceUpdate);
                return { success: true, items: users, missingIds: [] };
            } else if (type === ResourceType.GROUP) {
                const groups = await groupService.fetchGroupsByIds(ids, forceUpdate);
                return { success: true, items: groups, missingIds: [] };
            } else if (type === ResourceType.GROUP_MEMBER) {
                // IDs here are groupIds
                const membersWrapper = await groupService.fetchGroupMembersByIds(ids, forceUpdate);
                return { success: true, items: membersWrapper, missingIds: [] };
            } else if (type === ResourceType.GROUP_JOINED) {
                if (forceUpdate) {
                    const groupIds = await groupService.fetchUserGroupIds();
                    return { success: true, items: groupIds, missingIds: [] };
                }
                const groupIds = cacheManager.getUserGroupIds();
                return { success: true, items: groupIds, missingIds: [] };
            }

            // For other types, just return from cache (async now)
            const { items, missingIds } = await cacheManager.getItems(type, ids);
            return { success: true, items, missingIds };
        } catch (error) {
            console.error(`Failed to get ${type}:`, error);
            return { success: false, error: (error as Error).message, items: [], missingIds: ids };
        }
    });

    ipcMain.handle(IpcChannels.RESOURCE_UPDATE, async (_event, action: number, type: ResourceType, items: any[]) => {
        try {
            if (action === UpdateAction.Delete) {
                // deleteItem is now async — run all deletes in parallel
                const deletePromises: Promise<void>[] = [];
                for (const item of items) {
                    if (type === ResourceType.GROUP_JOINED) {
                        if (Array.isArray(item)) {
                            item.forEach(id => deletePromises.push(cacheManager.deleteItem(type, id)));
                        }
                    } else {
                        const idKey = type === ResourceType.USER ? 'user_id' :
                            type === ResourceType.GROUP ? 'id' :
                                type === ResourceType.FRIEND ? 'friend_id' :
                                    type === ResourceType.FRIEND_REQUEST ? 'request_id' : 'id';
                        deletePromises.push(cacheManager.deleteItem(type, item[idKey]));
                    }
                }
                await Promise.all(deletePromises);
            } else {
                await cacheManager.setItems(type, items);
            }
            // Broadcast to all renderers with action
            if (type === ResourceType.GROUP_JOINED) {
                cacheManager.broadcastUpdate(type, [{ action, data: items }]);
            } else {
                cacheManager.broadcastUpdate(type, items.map(item => ({ action, ...item })));
            }
            return { success: true };
        } catch (error) {
            console.error(`Failed to update ${type}:`, error);
            return { success: false, error: (error as Error).message };
        }
    });
}
