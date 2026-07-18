import { ipcMain } from 'electron';
import { tokenManager } from '@/electron/resource/tokenManager';
import { IpcChannels } from '@shared/types/ipc';
import { cacheManager } from '../cacheManager';

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
            tokenManager.operateLocalRefreshToken(false);
        } else {
            await cacheManager.onLogin(tokenManager.getCurrentUserID());
        }
        // token 必须回传：渲染进程 request.ts 的 401 重试依赖它重放原请求，
        // 缺失会被判定为刷新失败而触发登出
        return { success: result.success, error: result.error, token: result.token };
    });
}
