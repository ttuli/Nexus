import { dialog, BrowserWindow, shell, app } from 'electron';
import * as fs from 'fs';
import path from 'path';
import { APP_CONSTANTS } from '@/src/config/constants';
import * as https from 'https';
import * as http from 'http';
import { storage, StorageKeys } from '@/electron/utils/storage';

/**
 * 设置管理器
 * 负责应用设置的读写以及与本地文件系统相关的操作（路径选择、文件下载、文件定位等）
 */
class SettingManager {
    // 跟踪正在进行的下载请求以便取消
    private activeDownloads = new Map<string, http.ClientRequest>();

    /**
     * 获取当前资源存储根路径
     */
    getStoragePath(): string {
        const customPath = storage.get<string>(StorageKeys.CUSTOM_RESOURCE_PATH);
        if (customPath && fs.existsSync(customPath)) {
            try {
                // 测试是否可写
                fs.accessSync(customPath, fs.constants.R_OK | fs.constants.W_OK);
                return customPath;
            } catch (err) {
                console.error('[SettingManager] Custom resource path has no read/write access, falling back to default:', err);
            }
        }
        // 回退默认路径：用户数据目录下
        return path.join(app.getPath('userData'), `${APP_CONSTANTS.ApplicationName}Resources`);
    }

    /**
     * 弹出目录选择对话框，让用户选择新的资源存储路径，并持久化
     * @returns 选定的路径；用户取消时返回 null；无权限时抛出异常
     */
    async selectStoragePath(browserWindow: BrowserWindow): Promise<string | null> {
        const result = await dialog.showOpenDialog(browserWindow, {
            title: '选择资源存储路径',
            properties: ['openDirectory', 'createDirectory'],
            message: '请选择一个新的文件夹作为资源存储路径',
        });

        if (result.canceled || result.filePaths.length === 0) {
            return null;
        }

        const selectedPath = result.filePaths[0];

        // 检查读写权限
        try {
            fs.accessSync(selectedPath, fs.constants.R_OK | fs.constants.W_OK);
        } catch {
            throw new Error('所选目录没有读写权限，请重新选择');
        }

        storage.set(StorageKeys.CUSTOM_RESOURCE_PATH, selectedPath);
        return selectedPath;
    }

    /**
     * 将二进制图片数据直接保存为本地图片
     * @param buffer 图片的二进制数据 (Uint8Array)
     * @param fileName 可选的文件名，如果未提供则使用 UUID
     * @returns 保存的本地绝对路径
     */
    saveImageBuffer(buffer: Uint8Array, fileName?: string): string {
        const thumbnailsDir = path.join(this.getStoragePath(), 'thumbnails');
        if (!fs.existsSync(thumbnailsDir)) {
            fs.mkdirSync(thumbnailsDir, { recursive: true });
        }

        const name = fileName || `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.jpg`;
        const savePath = path.join(thumbnailsDir, name);

        fs.writeFileSync(savePath, buffer);
        return savePath;
    }

    /**
     * 在系统文件管理器中定位并高亮指定文件
     * @throws 文件不存在时抛出异常
     */
    showInFolder(filePath: string): void {
        if (!filePath) throw new Error('File path is required');
        if (!fs.existsSync(filePath)) throw new Error('File not found');
        shell.showItemInFolder(filePath);
    }

    /**
     * 检查本地文件是否存在
     */
    fileExists(filePath: string): boolean {
        if (!filePath) return false;
        return fs.existsSync(filePath);
    }

    /**
     * 下载文件到本地 files 目录，自动处理同名冲突
     * @param url        带签名的下载地址
     * @param fileName   期望的文件名（含扩展名）
     * @param onProgress 进度回调，参数为 0-100 的整数
     * @param downloadId 可选的下载ID，用于取消下载
     * @returns 最终保存的绝对路径
     */
    async downloadFile(
        url: string,
        fileName: string,
        onProgress?: (percent: number) => void,
        downloadId?: string
    ): Promise<string> {
        if (!url || !fileName) throw new Error('url and fileName are required');

        const basePath = this.getStoragePath();
        const dir = path.join(basePath, 'files');

        // 确保目录存在
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // 同名冲突处理：foo.mp4 → foo (1).mp4 → foo (2).mp4 ...
        const ext = path.extname(fileName);
        const base = path.basename(fileName, ext);
        let savePath = path.join(dir, fileName);
        let counter = 1;
        while (fs.existsSync(savePath)) {
            savePath = path.join(dir, `${base} (${counter++})${ext}`);
        }

        // 使用 Node.js 原生 https/http 下载
        const protocol = url.startsWith('https') ? https : http;
        await new Promise<void>((resolve, reject) => {
            const file = fs.createWriteStream(savePath);
            const request = protocol.get(url, (response: any) => {
                const totalLength = parseInt(response.headers['content-length'] || '0', 10);
                let downloaded = 0;

                response.on('data', (chunk: Buffer) => {
                    downloaded += chunk.length;
                    if (onProgress && totalLength > 0) {
                        onProgress(Math.round((downloaded / totalLength) * 100));
                    }
                });

                response.pipe(file);
                file.on('finish', () => { 
                    file.close(); 
                    if (downloadId) this.activeDownloads.delete(downloadId);
                    resolve(); 
                });
                file.on('error', (err: Error) => {
                    if (downloadId) this.activeDownloads.delete(downloadId);
                    fs.unlink(savePath, () => { });
                    reject(err);
                });
            }).on('error', (err: Error) => {
                if (downloadId) this.activeDownloads.delete(downloadId);
                fs.unlink(savePath, () => { });
                reject(err);
            });

            if (downloadId) {
                this.activeDownloads.set(downloadId, request as http.ClientRequest);
            }
        });

        return savePath;
    }

    /**
     * 取消正在进行的下载
     * @param downloadId 下载ID
     */
    cancelDownload(downloadId: string): void {
        const request = this.activeDownloads.get(downloadId);
        if (request) {
            request.destroy(new Error('Download cancelled by user'));
            this.activeDownloads.delete(downloadId);
            console.log(`[SettingManager] Download ${downloadId} cancelled.`);
        }
    }
}

export const settingManager = new SettingManager();
export default settingManager;
