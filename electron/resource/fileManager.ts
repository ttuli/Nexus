import { ApiTypes } from '@/src/types';
import { APP_CONSTANTS } from '@/src/config/constants';
import { mainGet, decodeMainResponse, ApiResponse } from './mainRequest';

class FileManager {

    /**
     * 获取文件访问 URL（主进程版本）
     * 对应渲染进程 src/apis/file.ts 中的 getAcessUrl
     */
    public async getAccessUrl(data: ApiTypes.file.GetAccessUrlReq): Promise<ApiResponse<ApiTypes.file.GetAccessUrlResp>> {
        const params = new URLSearchParams();
        if (data.file_key) params.append('file_key', data.file_key);
        if (data.file_type !== undefined) params.append('file_type', String(data.file_type));
        if (data.oss_process) params.append('oss_process', data.oss_process);
        if (data.method !== undefined) params.append('method', String(data.method));

        const url = `${APP_CONSTANTS.fileServer}/fileupload/getAccessUrl?${params.toString()}`;
        const res = await mainGet<ApiTypes.file.GetAccessUrlResp>(url);
        return decodeMainResponse(res, ApiTypes.file.GetAccessUrlResp.decode);
    }

}

export const fileManager = new FileManager();