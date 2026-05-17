import { ipcMain } from 'electron';
import { tokenManager } from '../tokenManager';
import { IpcChannels } from '../../../src/types/ipc';

/**
 * Token 相关 IPC 处理器
 */
export function setupTokenHandlers(): void {
    ipcMain.handle(IpcChannels.RESOURCE_GET_ALL_INFO, async () => {
        return {
            success: true,
            token: tokenManager.getToken(),
            refreshToken: tokenManager.getRefreshToken(),
        };
    });

    ipcMain.handle(IpcChannels.AUTH_ABLE_TO_AUTO_LOGIN, async () => {
        return (tokenManager.getRefreshToken() !== '');
    });

    ipcMain.handle(IpcChannels.RESOURCE_REQUEST_TOKEN_REFRESH, async () => {
        const result = await tokenManager.requestTokenRefresh();
        if (!result.success) {
            tokenManager.setStoreRefreshToken(false);
        }
        return { success: result.success, error: result.error };
    });
}
