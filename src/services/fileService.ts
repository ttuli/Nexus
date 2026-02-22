import { getUploadSignature } from '@/apis/file'
import { ApiTypes } from '@/types'

class FileService {
    /**
     * 获取上传签名
     */
    async getUploadSignature(data: ApiTypes.file.GetPostSignatureReq) {
        return getUploadSignature(data)
    }
}

export const fileService = new FileService()
export default fileService
