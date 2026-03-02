import { ipcMain } from 'electron';
import { cacheManager } from '../cacheManager';
import { userService } from '../userManager';
import { groupService } from '../groupManager';
import { ResourceType } from '../../../src/types/resourceCache';
import { IpcChannels } from '../../../src/types/ipc';

import { UpdateAction } from '../../../src/types/common';

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
                    let ids = await groupService.fetchUserGroupIds();
                    return { success: true, items: ids, missingIds: [] };
                }
                const groupIds = cacheManager.getUserGroupIds();
                return { success: true, items: groupIds, missingIds: [] };
            }

            // For other types, just return from cache
            const { items, missingIds } = cacheManager.getItems(type, ids);
            return { success: true, items, missingIds };
        } catch (error) {
            console.error(`Failed to get ${type}:`, error);
            return { success: false, error: (error as Error).message, items: [], missingIds: ids };
        }
    });

    ipcMain.handle(IpcChannels.RESOURCE_UPDATE, async (_event, action: number, type: ResourceType, items: any[]) => {
        try {
            if (action === UpdateAction.Delete) {
                items.forEach(item => {
                    if (type === ResourceType.GROUP_JOINED) {
                        if (Array.isArray(item)) {
                            item.forEach(id => cacheManager.deleteItem(type, id));
                        }
                    } else {
                        const idKey = type === ResourceType.USER ? 'user_id' :
                            type === ResourceType.GROUP ? 'id' :
                                type === ResourceType.FRIEND ? 'friend_id' :
                                    type === ResourceType.FRIEND_REQUEST ? 'request_id' : 'id';
                        cacheManager.deleteItem(type, item[idKey]);
                    }
                });
            } else {
                if (type === ResourceType.GROUP_JOINED) {
                    cacheManager.setItems(type, items);
                } else {
                    cacheManager.setItems(type, items);
                }
            }
            // Broadcast to all renderers with action
            if (type === ResourceType.GROUP_JOINED) {
                cacheManager.broadcastUpdate(type, items.map(item => ({ action, data: item })));
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
