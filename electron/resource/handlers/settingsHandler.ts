import { ipcMain, dialog, BrowserWindow, shell } from 'electron';
import { IpcChannels } from '../../../src/types';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
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

    // 在资源管理器中显示文件
    ipcMain.handle(IpcChannels.SYSTEM_SHOW_IN_FOLDER, async (_event, filePath: string) => {
        try {
            if (!filePath) {
                return { success: false, error: 'File path is required' };
            }
            if (!fs.existsSync(filePath)) {
                return { success: false, error: 'File not found' };
            }
            shell.showItemInFolder(filePath);
            return { success: true };
        } catch (error: any) {
            console.error('[SettingsHandler] Show in folder error:', error);
            return { success: false, error: error.message };
        }
    });

    // 检查文件是否存在
    ipcMain.handle(IpcChannels.SYSTEM_FILE_EXISTS, async (_event, filePath: string) => {
        try {
            if (!filePath) return { success: true, data: false };
            return { success: true, data: fs.existsSync(filePath) };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    });

    // 下载文件到本地
    ipcMain.handle(IpcChannels.SYSTEM_DOWNLOAD_FILE, async (_event, { url, fileName, onProgressChannel }: { url: string; fileName: string; onProgressChannel?: string }) => {
        try {
            if (!url || !fileName) {
                return { success: false, error: 'url and fileName are required' };
            }

            // 通过 storage 获取基础路径，不需要渲染进程额外发起一次 IPC
            const basePath = storage.getResourcePath();
            const savePath = path.join(basePath, 'files', fileName);

            // 确保目录存在
            const dir = path.dirname(savePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            // 使用 https/http 模块下载
            const protocol = url.startsWith('https') ? https : http;
            await new Promise<void>((resolve, reject) => {
                const file = fs.createWriteStream(savePath);
                protocol.get(url, (response: any) => {
                    const totalLength = parseInt(response.headers['content-length'] || '0', 10);
                    let downloaded = 0;

                    response.on('data', (chunk: Buffer) => {
                        downloaded += chunk.length;
                        if (onProgressChannel && totalLength > 0) {
                            const sender = BrowserWindow.getAllWindows()[0]?.webContents;
                            if (sender) {
                                sender.send(onProgressChannel, Math.round((downloaded / totalLength) * 100));
                            }
                        }
                    });

                    response.pipe(file);
                    file.on('finish', () => { file.close(); resolve(); });
                    file.on('error', (err: Error) => {
                        fs.unlink(savePath, () => { });
                        reject(err);
                    });
                }).on('error', (err: Error) => {
                    fs.unlink(savePath, () => { });
                    reject(err);
                });
            });

            return { success: true, data: savePath };
        } catch (error: any) {
            console.error('[SettingsHandler] Download file error:', error);
            return { success: false, error: error.message };
        }
    });
}
