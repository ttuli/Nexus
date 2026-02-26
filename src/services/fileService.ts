import { getUploadSignature } from '@/apis/file'
import { ApiTypes } from '@/types'
import { computeFileMd5 } from '@/utils/md5'

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
}

export const fileService = new FileService()
export default fileService
