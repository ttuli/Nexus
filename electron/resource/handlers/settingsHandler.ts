import { ipcMain, BrowserWindow } from 'electron';
import { IpcChannels } from '../../../src/types';
import { settingManager } from '../settingManager';

export function setupSettingsHandlers(): void {
    // 获取当前存储路径
    ipcMain.handle(IpcChannels.SETTINGS_GET_STORAGE_PATH, () => {
        try {
            return { success: true, data: settingManager.getStoragePath() };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    });

    // 保存二进制图片到本地缓存
    ipcMain.handle(IpcChannels.SYSTEM_SAVE_IMAGE_BUFFER, (_event, { buffer, fileName }: { buffer: Uint8Array, fileName?: string }) => {
        try {
            return { success: true, data: settingManager.saveImageBuffer(buffer, fileName) };
        } catch (error: any) {
            console.error('[SettingsHandler] Save image buffer error:', error);
            return { success: false, error: error.message };
        }
    });

    // 选择并设置新的存储路径
    ipcMain.handle(IpcChannels.SETTINGS_SELECT_STORAGE_PATH, async (event) => {
        try {
            const browserWindow = BrowserWindow.fromWebContents(event.sender)!;
            const selectedPath = await settingManager.selectStoragePath(browserWindow);
            if (selectedPath === null) {
                return { success: false, error: 'User canceled' };
            }
            return { success: true, data: selectedPath };
        } catch (error: any) {
            console.error('[SettingsHandler] Select storage path error:', error);
            return { success: false, error: error.message };
        }
    });

    // 在资源管理器中显示文件
    ipcMain.handle(IpcChannels.SYSTEM_SHOW_IN_FOLDER, (_event, filePath: string) => {
        try {
            settingManager.showInFolder(filePath);
            return { success: true };
        } catch (error: any) {
            console.error('[SettingsHandler] Show in folder error:', error);
            return { success: false, error: error.message };
        }
    });

    // 检查文件是否存在
    ipcMain.handle(IpcChannels.SYSTEM_FILE_EXISTS, (_event, filePath: string) => {
        try {
            return { success: true, data: settingManager.fileExists(filePath) };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    });

    // 下载文件到本地
    ipcMain.handle(IpcChannels.SYSTEM_DOWNLOAD_FILE, async (_event, { url, fileName, onProgressChannel }: {
        url: string;
        fileName: string;
        onProgressChannel?: string;
    }) => {
        try {
            const onProgress = onProgressChannel
                ? (percent: number) => {
                    const sender = BrowserWindow.getAllWindows()[0]?.webContents;
                    sender?.send(onProgressChannel, percent);
                }
                : undefined;

            const savePath = await settingManager.downloadFile(url, fileName, onProgress);
            return { success: true, data: savePath };
        } catch (error: any) {
            console.error('[SettingsHandler] Download file error:', error);
            return { success: false, error: error.message };
        }
    });
}
