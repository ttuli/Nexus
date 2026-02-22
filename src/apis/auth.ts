import instance, { decodeResponse } from '@/utils/request'
import { ApiTypes } from '@/types';
import { config } from '@/config';

// ==================== Auth APIs ====================

export async function register(data: ApiTypes.auth.RegisterReq) {
  // data is already typed as RegisterReq (snake_case)
  let res = await instance.post(config.authServer + '/auth/register', data)
  return decodeResponse(res.data, ApiTypes.auth.RegisterResp.decode)
}

export async function sendCode(phone: string) {
  // GetAuthCodeReq
  const data: ApiTypes.auth.GetAuthCodeReq = { phone };

  let res = await instance.post(config.authServer + '/auth/getAuthCode', data)
  return decodeResponse(res.data, ApiTypes.auth.GetAuthCodeResp.decode)
}