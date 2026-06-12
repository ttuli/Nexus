import { ipcMain } from 'electron';
import { groupService } from '@/electron/resource/groupManager';
import { IpcChannels } from '@/src/types/ipc';

/**
 * Group IPC 处理器
 */
export function setupGroupHandlers(): void {
    ipcMain.handle(IpcChannels.GROUP_FETCH_USER_GROUPS, async () => {
        try {
            const data = await groupService.fetchUserGroupIds();
            return { success: true, data };
        } catch (error) {
            console.error('Failed to fetch user groups:', error);
            return { success: false, error: (error as Error).message, data: [] };
        }
    });

    ipcMain.handle(IpcChannels.GROUP_FETCH_BY_NAME, async (_event, name: string, limit: number = 20, offset: number = 0) => {
        try {
            const data = await groupService.fetchGroupsByName(name, limit, offset);
            return { success: true, data };
        } catch (error) {
            console.error('Failed to fetch groups by name:', error);
            return { success: false, error: (error as Error).message, data: [] };
        }
    });

    ipcMain.handle(IpcChannels.GROUP_FETCH_MEMBERS, async (_event, groupId: number, forceUpdate: boolean = false) => {
        try {
            const data = await groupService.fetchGroupMembers(groupId, forceUpdate);
            return { success: true, data };
        } catch (error) {
            console.error('Failed to fetch group members:', error);
            return { success: false, error: (error as Error).message, data: [] };
        }
    });

    ipcMain.handle(IpcChannels.GROUP_FETCH_PENDING_APPLIES, async () => {
        try {
            const data = await groupService.fetchPendingApplies();
            return { success: true, data };
        } catch (error) {
            console.error('Failed to fetch pending group applies:', error);
            return { success: false, error: (error as Error).message, data: [] };
        }
    });
}
