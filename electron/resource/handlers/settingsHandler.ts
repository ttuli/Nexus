import { ipcMain, dialog, BrowserWindow } from 'electron';
import { IpcChannels } from '../../../src/types';
import * as fs from 'fs';
import { storage, StorageKeys } from '../../utils/storage';

export function setupSettingsHandlers(): void {
    // 获取当前存储路径
    ipcMain.handle(IpcChannels.SETTINGS_GET_STORAGE_PATH, async () => {
        try {
            return {
                success: true,
                data: storage.getResourcePath()
            };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    });

    // 选择并设置新的存储路径
    ipcMain.handle(IpcChannels.SETTINGS_SELECT_STORAGE_PATH, async (event) => {
        try {
            const browserWindow = BrowserWindow.fromWebContents(event.sender);
            const result = await dialog.showOpenDialog(browserWindow!, {
                title: '选择资源存储路径',
                properties: ['openDirectory', 'createDirectory'],
                message: '请选择一个新的文件夹作为资源存储路径'
            });

            if (result.canceled || result.filePaths.length === 0) {
                return { success: false, error: 'User canceled' };
            }

            const selectedPath = result.filePaths[0];

            // 测试是否有读写权限
            try {
                fs.accessSync(selectedPath, fs.constants.R_OK | fs.constants.W_OK);
            } catch (err) {
                return { success: false, error: '所选目录没有读写权限，请重新选择' };
            }

            // 保存路径配置
            storage.set(StorageKeys.CUSTOM_RESOURCE_PATH, selectedPath);

            return {
                success: true,
                data: selectedPath
            };
        } catch (error: any) {
            console.error('[SettingsHandler] Select storage path error:', error);
            return { success: false, error: error.message };
        }
    });
}
