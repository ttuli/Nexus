import { ipcMain } from 'electron';
import { authManager } from '@/electron/resource/authManager';
import { tokenManager } from '@/electron/resource/tokenManager';
import { cacheManager } from '@/electron/resource/cacheManager';
import { userService } from '@/electron/resource/userManager';
import { IpcChannels } from '@/src/types/ipc';
/**
 * Auth 相关 IPC 处理器
 */
export function setupAuthHandlers(): void {
    ipcMain.handle(IpcChannels.AUTH_LOGIN, async (_event, data: { account: string; password: string; remember: boolean }) => {
        try {
            const result = await authManager.doLogin(data.account, data.password, data.remember);
            if (result.success && result.userId) {
                // 登录成功：先打开该用户的数据库，再执行其他初始化
                cacheManager.onLogin(result.userId).then(() => {
                    userService.cacheLoginAccount(result.userId!, data.account).then(() => {
                        tokenManager.operateLocalRefreshToken(data.remember);
                    }).catch(() => {
                        tokenManager.operateLocalRefreshToken(false);
                    });
                }).catch(err => {
                    console.error('[authHandler] cacheManager.onLogin failed:', err);
                    tokenManager.operateLocalRefreshToken(false);
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
