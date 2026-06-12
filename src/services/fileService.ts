import { getUploadSignature, getAcessUrl } from '@/src/apis/file'
import { ApiTypes } from '@/src/types'
import { computeFileMd5 } from '@/src/utils/md5'
import { APP_CONSTANTS as config, Renderer_Config } from '@/src/config/constants'
import { ipcService } from './ipcService';
import { IpcChannels } from '@/src/types/ipc';

class FileService {
    /**
     * 上传文件到文件服务器
     */
    uploadFile(
        file: File,
        fileType: ApiTypes.file.FileType,
        onProgress?: (progress: number) => void
    ): { promise: Promise<string>, abort: () => void } {
        let abortController = new AbortController();

        const promise = (async () => {
            const md5 = await computeFileMd5(file)
            const response = await getUploadSignature({
                file_type: Number(fileType),
                file_name: md5
            })
            if (!response.data.policy) {
                throw new Error('Failed to get upload policy');
            }
            const policy = response.data.policy
            const key = policy.dir + md5

            if (response.data.is_exits) {
                onProgress?.(100)
                return policy.host + '/' + key
            }

            let formData = new FormData();
            formData.append("success_action_status", "200");
            formData.append("policy", policy.policy);
            formData.append("x-oss-signature", policy.signature);
            formData.append("x-oss-signature-version", policy.x_oss_signature_version);
            formData.append("x-oss-credential", policy.x_oss_credential);
            formData.append("x-oss-date", policy.x_oss_date);
            formData.append("key", key);
            formData.append("x-oss-security-token", policy.security_token);
            formData.append("callback", policy.callback);
            formData.append("file", file);

            return new Promise<string>((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('POST', policy.host);

                // 监听取消信号
                abortController.signal.addEventListener('abort', () => {
                    xhr.abort();
                    reject(new DOMException('Upload aborted', 'AbortError'));
                });

                if (onProgress) {
                    xhr.upload.onprogress = (event) => {
                        if (event.lengthComputable) {
                            const percentComplete = Math.round((event.loaded / event.total) * 100);
                            onProgress(percentComplete);
                        }
                    };
                }

                xhr.onload = () => {
                    if (xhr.status === 200) {
                        resolve(policy.host + '/' + key);
                    } else {
                        console.log(xhr.responseText)
                        reject(new Error(`Upload failed with status: ${xhr.status}`));
                    }
                };

                xhr.onerror = (ev) => reject(
                    new Error('Upload failed network error' + JSON.stringify(ev))
                );

                xhr.send(formData);
            });
        })();

        return {
            promise,
            abort: () => abortController.abort()
        };
    }

    /**
     * 从 OSS URL 中提取 file_key（去掉 host 及开头的 /）
     */
    private extractFileKey(url: string): string {
        try {
            const urlObj = new URL(url);
            return urlObj.pathname.replace(/^\//, '');
        } catch {
            return url;
        }
    }

    private async checkFileExists(fileKey: string, fileType: ApiTypes.file.FileType): Promise<boolean> {
        const resp = await getAcessUrl({
            file_key: fileKey,
            file_type: fileType,
            oss_process: '',
            method: ApiTypes.file.GetMethod.MethodHead
        });
        const accessUrl = resp.data?.access_url || '';
        if (accessUrl) {
            try {
                const checkRes = await fetch(accessUrl, { method: 'HEAD' });
                if (checkRes.status === 404) {
                    return false;
                }
            } catch (error) {
                console.warn('Failed to check accessUrl status:', error);
            }
        }
        return true;
    }

    /**
     * 获取带签名的缩略图 URL
     * 会根据原始宽高和 config 中的限制计算合适的缩略尺寸，附加 oss_process 参数
     */
    async getImageThumbnailUrl(url: string, width: number, height: number): Promise<string> {
        const fileKey = this.extractFileKey(url);

        // 计算合适的缩略尺寸
        let targetW = width || 0;
        let targetH = height || 0;
        if (targetW > 0 && targetH > 0) {
            if (targetW > config.maxImageWidth || targetH > config.maxImageHeight) {
                const ratio = Math.min(config.maxImageWidth / targetW, config.maxImageHeight / targetH);
                targetW = Math.round(targetW * ratio);
                targetH = Math.round(targetH * ratio);
            }
        }

        let ossProcess = '';
        if (targetW > 0 && targetH > 0) {
            ossProcess = `image/resize,m_lfit,w_${targetW},h_${targetH}/image/compress,q_${Renderer_Config.imageCompressQuality}`;
        }

        if (!(await this.checkFileExists(fileKey, ApiTypes.file.FileType.FileTypeChatImage))) {
            return '';
        }

        const resp = await getAcessUrl({
            file_key: fileKey,
            file_type: ApiTypes.file.FileType.FileTypeChatImage,
            oss_process: ossProcess,
            method: ApiTypes.file.GetMethod.MethodGet
        });

        return resp.data?.access_url || '';
    }

    /**
     * 获取带签名的原图 URL（无 oss_process，用于查看大图）
     */
    async getImageUrl(url: string): Promise<string> {
        const fileKey = this.extractFileKey(url);

        if (!(await this.checkFileExists(fileKey, ApiTypes.file.FileType.FileTypeChatImage))) {
            return '';
        }

        const resp = await getAcessUrl({
            file_key: fileKey,
            file_type: ApiTypes.file.FileType.FileTypeChatImage,
            oss_process: '',
            method: ApiTypes.file.GetMethod.MethodGet
        });

        const accessUrl = resp.data?.access_url || '';
        if (accessUrl) {
            try {
                const checkRes = await fetch(accessUrl, { method: 'HEAD' });
                console.log(checkRes)
                if (checkRes.status === 404) {
                    return '';
                }
            } catch (error) {
                // Ignore fetch errors, fallback to returning the url
                console.warn('Failed to check accessUrl status:', error);
            }
        }
        return accessUrl;
    }

    /**
     * 获取带签名的文件下载 URL
     */
    async getFileUrl(url: string, oss_process?: string): Promise<string> {
        const fileKey = this.extractFileKey(url);

        if (!(await this.checkFileExists(fileKey, ApiTypes.file.FileType.FileTypeChatFile))) {
            return '';
        }
        const resp = await getAcessUrl({
            file_key: fileKey,
            file_type: ApiTypes.file.FileType.FileTypeChatFile,
            oss_process: oss_process || '',
            method: ApiTypes.file.GetMethod.MethodGet
        });

        return resp.data?.access_url || '';
    }

    /**
     * 检查文件是否存在于本地
     */
    async checkLocalFileExists(localPath: string): Promise<boolean> {
        if (!localPath) return false;
        try {
            const { ipcService } = await import('./ipcService');
            const { IpcChannels } = await import('@/src/types/ipc');
            const res = await ipcService.invoke(IpcChannels.SYSTEM_FILE_EXISTS, localPath);
            return res?.success && res?.data === true;
        } catch {
            return false;
        }
    }

    /**
     * 下载文件到本地
     * @param url OSS 文件资源 URL
     * @param fileName 文件名 (includes extension)
     * @param onProgress 进度回调 0-100
     * @returns 保存到本地的绝对路径
     */
    async downloadFile(url: string, fileName: string, onProgress?: (progress: number) => void): Promise<{ promise: Promise<string>, abort: () => void }> {
        // 获取带签名的下载 URL
        const downloadUrl = await this.getFileUrl(url);
        if (!downloadUrl) throw new Error('无法获取文件下载地址');

        // 过滤文件名中的非法字符
        const sanitizedFileName = fileName.replace(/[\\/:*?"<>|]/g, '_');

        const downloadId = `dl_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

        // 设置进度监听 (unique 渠道)
        const progressChannel = onProgress ? `file-download-progress-${downloadId}` : undefined;
        if (progressChannel && onProgress) {
            ipcService.on(progressChannel as any, (_evt: any, percent: number) => {
                onProgress(percent);
            });
        }

        const promise = (async () => {
            try {
                const res = await ipcService.invoke(IpcChannels.SYSTEM_DOWNLOAD_FILE, {
                    url: downloadUrl,
                    fileName: sanitizedFileName,
                    onProgressChannel: progressChannel,
                    downloadId
                });

                if (!res?.success) {
                    throw new Error(res?.error || '下载失败');
                }
                return res.data as string;
            } finally {
                if (progressChannel) {
                    ipcService.off(progressChannel as any);
                }
            }
        })();

        return {
            promise,
            abort: () => {
                ipcService.invoke(IpcChannels.SYSTEM_CANCEL_DOWNLOAD, downloadId);
            }
        };
    }
}

export const fileService = new FileService()
export default fileService
