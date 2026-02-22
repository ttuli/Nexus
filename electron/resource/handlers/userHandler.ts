import { ipcMain } from 'electron';
import { userService } from '../userManager';
import { friendService } from '../friendManager';
import { IpcChannels } from '../../../src/types/ipc';

/**
 * User + Friend IPC 处理器
 */
export function setupUserHandlers(): void {
    // ==================== 用户服务 ====================

    ipcMain.handle(IpcChannels.USER_FETCH_BY_PHONE, async (_event, phone: string) => {
        try {
            const users = await userService.fetchUserByPhone(phone);
            return { success: true, data: users };
        } catch (error) {
            console.error('Failed to fetch user by phone:', error);
            return { success: false, error: (error as Error).message, data: [] };
        }
    });

    ipcMain.handle(IpcChannels.USER_FETCH_BY_NAME, async (_event, name: string, limit: number = 20, offset: number = 0) => {
        try {
            const users = await userService.fetchUserByName(name, limit, offset);
            return { success: true, data: users };
        } catch (error) {
            console.error('Failed to fetch user by name:', error);
            return { success: false, error: (error as Error).message, data: [] };
        }
    });

    ipcMain.handle(IpcChannels.USER_CACHE_LOGIN_ACCOUNT, async (_event, userId: number) => {
        try {
            await userService.cacheLoginAccount(userId);
            return { success: true };
        } catch (error) {
            console.error('Failed to cache login account:', error);
            return { success: false, error: (error as Error).message };
        }
    });

    ipcMain.handle(IpcChannels.USER_GET_LOGIN_HISTORY, async () => {
        try {
            const history = userService.getLoginHistory();
            return { success: true, data: history };
        } catch (error) {
            console.error('Failed to get login history:', error);
            return { success: false, error: (error as Error).message, data: [] };
        }
    });

    // ==================== 好友服务 ====================

    ipcMain.handle(IpcChannels.FRIEND_FETCH_LIST, async () => {
        try {
            const data = await friendService.fetchFriendList();
            return { success: true, data };
        } catch (error) {
            console.error('Failed to fetch friend list:', error);
            return { success: false, error: (error as Error).message, data: [] };
        }
    });

    ipcMain.handle(IpcChannels.FRIEND_FETCH_PENDING, async () => {
        try {
            const data = await friendService.fetchPendingRequests();
            return { success: true, data };
        } catch (error) {
            console.error('Failed to fetch pending requests:', error);
            return { success: false, error: (error as Error).message, data: [] };
        }
    });
}
