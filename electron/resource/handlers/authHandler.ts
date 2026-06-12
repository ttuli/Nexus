import { ipcMain } from 'electron';
import { authManager } from '@/electron/resource/authManager';
import { tokenManager } from '@/electron/resource/tokenManager';
import { userService } from '@/electron/resource/userManager';
import { storage, StorageKeys } from '@/electron/utils/storage';
import { IpcChannels } from '@/src/types/ipc';

/**
 * Auth 相关 IPC 处理器
 */
export function setupAuthHandlers(): void {
    ipcMain.handle(IpcChannels.AUTH_LOGIN, async (_event, data: { account: string; password: string; remember: boolean }) => {
        try {
            const result = await authManager.doLogin(data.account, data.password, data.remember);
            if (result.success && result.userId) {
                userService.cacheLoginAccount(result.userId, data.account).then(() => {
                    if (tokenManager.getStoreRefreshToken()) {
                        storage.set(StorageKeys.REFRESH_TOKEN, tokenManager.getRefreshToken())
                    }
                    tokenManager.setStoreRefreshToken(data.remember);
                }).catch(() => {
                    tokenManager.setStoreRefreshToken(false);
                });
            }
            return result;
        } catch (error) {
            console.error('Login failed:', error);
            return { success: false, error: (error as Error).message };
        }
    });

    ipcMain.handle(IpcChannels.RESOURCE_GET_DEVICE_INFO, async () => {
        const { deviceId, platform } = authManager.getDeviceInfo();
        return { success: true, deviceId, platform };
    });
}
