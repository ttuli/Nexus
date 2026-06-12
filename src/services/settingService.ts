/**
 * 设置服务
 * 封装客户端设置相关的 IPC 调用（存储路径、文件系统操作等）
 */
import { ipcService } from './ipcService';
import { IpcChannels } from '@/src/types/ipc';

class SettingService {
    /**
     * 获取用户配置的资源存储根目录路径
     * 对应设置页「资源存储路径」选项
     */
    async getStoragePath(): Promise<string> {
        const res = await ipcService.invoke<string>(IpcChannels.SETTINGS_GET_STORAGE_PATH);
        if (res?.success && res.data) {
            return res.data;
        }
        throw new Error(`[SettingService] 获取存储路径失败: ${res?.error ?? 'unknown'}`);
    }

    /**
     * 在系统文件管理器中定位并高亮指定文件
     * 对应 Electron shell.showItemInFolder
     * @param localPath 本地文件绝对路径
     * @returns 成功返回 true，文件不存在或失败返回 false
     */
    async showInFolder(localPath: string): Promise<boolean> {
        const res = await ipcService.invoke(IpcChannels.SYSTEM_SHOW_IN_FOLDER, localPath);
        return res?.success === true;
    }


    /**
     * 将二进制图片数据(Uint8Array)保存为本地文件
     * @param buffer 图片的二进制数据
     * @param fileName 可选的文件名
     * @returns 保存的本地绝对路径
     */
    async saveImageBuffer(buffer: Uint8Array, fileName?: string): Promise<string> {
        const res = await ipcService.invoke<string>(IpcChannels.SYSTEM_SAVE_IMAGE_BUFFER, { buffer, fileName });
        if (res?.success && res.data) {
            return res.data;
        }
        throw new Error(`[SettingService] 保存二进制图片失败: ${res?.error ?? 'unknown'}`);
    }
}

export const settingService = new SettingService();
export default settingService;
