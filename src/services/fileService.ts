import { getUploadSignature, getAcessUrl } from '@/apis/file'
import { ApiTypes } from '@/types'
import { computeFileMd5 } from '@/utils/md5'
import { config } from '@/config'

class FileService {
    /**
     * 获取上传签名
     */
    async getUploadSignature(data: ApiTypes.file.GetPostSignatureReq) {
        return getUploadSignature(data)
    }

    /**
     * 上传文件到文件服务器
     */
    async uploadFile(file: File, fileType: ApiTypes.file.FileType, onProgress?: (progress: number) => void): Promise<string> {
        const response = await this.getUploadSignature({ file_type: Number(fileType) })
        const md5 = await computeFileMd5(file)
        const key = response.data.dir + md5

        let formData = new FormData();
        formData.append("success_action_status", "200");
        formData.append("policy", response.data.policy);
        formData.append("x-oss-signature", response.data.signature);
        formData.append("x-oss-signature-version", "OSS4-HMAC-SHA256");
        formData.append("x-oss-credential", response.data.x_oss_credential);
        formData.append("x-oss-date", response.data.x_oss_date);
        formData.append("key", key);
        formData.append("x-oss-security-token", response.data.security_token);
        formData.append("callback", response.data.callback);
        formData.append("file", file);

        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', response.data.host);

            if (onProgress) {
                xhr.upload.onprogress = (event) => {
                    if (event.lengthComputable) {
                        const percentComplete = Math.round((event.loaded / event.total) * 100);
                        onProgress(percentComplete);
                    }
                };
            }

            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(response.data.host + '/' + key);
                } else {
                    reject(new Error(`Upload failed with status: ${xhr.status}`));
                }
            };

            xhr.onerror = () => reject(new Error('Upload failed network error'));

            xhr.send(formData);
        });
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
            if (targetW > config.message.image.max_width || targetH > config.message.image.max_height) {
                const ratio = Math.min(config.message.image.max_width / targetW, config.message.image.max_height / targetH);
                targetW = Math.round(targetW * ratio);
                targetH = Math.round(targetH * ratio);
            }
            targetW = Math.max(targetW, config.message.image.min_size);
            targetH = Math.max(targetH, config.message.image.min_size);
        }

        let ossProcess = '';
        if (targetW > 0 && targetH > 0) {
            ossProcess = `image/resize,m_lfit,w_${targetW},h_${targetH}`;
        }

        const resp = await getAcessUrl({
            file_key: fileKey,
            file_type: ApiTypes.file.FileType.FileTypeChatImage,
            oss_process: ossProcess
        });

        return resp.data?.access_url || '';
    }

    /**
     * 获取带签名的原图 URL（无 oss_process，用于查看大图）
     */
    async getImageUrl(url: string): Promise<string> {
        const fileKey = this.extractFileKey(url);

        const resp = await getAcessUrl({
            file_key: fileKey,
            file_type: ApiTypes.file.FileType.FileTypeChatImage,
            oss_process: ''
        });

        return resp.data?.access_url || '';
    }
}

export const fileService = new FileService()
export default fileService
