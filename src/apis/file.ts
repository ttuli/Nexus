import instance, { decodeResponse, ApiResponse } from '@/utils/request'
import { ApiTypes } from '@/types'
import { APP_CONSTANTS as config } from '@/config/constants';

export async function getUploadSignature(data: ApiTypes.file.GetPostSignatureReq) {
  // GetPostSignatureReq has `key: string`, `content_md5: string`, etc.
  // Axios params will serialize it.
  // Assuming simple types match.

  let res = await instance.get<ApiResponse<ApiTypes.file.GetPostSignatureResp>>(config.fileServer + '/fileupload/getPostSignature', {
    params: data
  })
  return decodeResponse(res.data, ApiTypes.file.GetPostSignatureResp.decode)
}

export async function getAcessUrl(data: ApiTypes.file.GetAccessUrlReq) {
  let res = await instance.get<ApiResponse<ApiTypes.file.GetAccessUrlResp>>(config.fileServer + '/fileupload/getAccessUrl', {
    params: data
  })
  return decodeResponse(res.data, ApiTypes.file.GetAccessUrlResp.decode)
}