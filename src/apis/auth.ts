import instance, { decodeResponse } from '@/src/utils/request'
import { ApiTypes } from '@/src/types';
import { APP_CONSTANTS as config } from '@/src/config/constants';

// ==================== Auth APIs ====================

export async function register(data: ApiTypes.auth.RegisterReq) {
  // data is already typed as RegisterReq (snake_case)
  const reqData = ApiTypes.auth.RegisterReq.encode(data).finish()
  let res = await instance.post(config.authServer + '/auth/register', reqData)
  return decodeResponse(res.data, ApiTypes.auth.RegisterResp.decode)
}

export async function sendCode(phone: string) {
  // GetAuthCodeReq
  const data: ApiTypes.auth.GetAuthCodeReq = { phone };

  const reqData = ApiTypes.auth.GetAuthCodeReq.encode(data).finish()
  let res = await instance.post(config.authServer + '/auth/getAuthCode', reqData)
  return decodeResponse(res.data, ApiTypes.auth.GetAuthCodeResp.decode)
}