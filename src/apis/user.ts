import instance from '@/utils/request'
import { ApiResponse } from '@/types/common/common'
import {
  LoginRequest, LoginResponse,
  RegisterRequest, UpdateUserInfoRequest,
  UserInfo, GetUserInfoResp
} from '@/types/user'

import { ParseUserInfo, StoreUserInfo } from '@/utils/store'

const userServer = import.meta.env.VITE_USER_SERVER

export async function login(data: LoginRequest) {
  return await instance<ApiResponse<LoginResponse>>({
    url: userServer + '/user/login',
    method: 'post',
    data
  }).then(res => res.data)
}

export async function register(data: RegisterRequest) {
  return await instance.post(userServer + '/user/register', data)
}

export async function getUserInfo(ids: string[]) {
  let res = await instance<ApiResponse<GetUserInfoResp>>({
    method: 'get',
    url: userServer + '/user/userInfo',
    params: { ids },
  })
  return res.data
}

export async function getUserInfoByPhone(phone: string) {
  let res = await instance<ApiResponse<GetUserInfoResp>>({
    method: 'get',
    url: userServer + '/user/userInfo',
    params: { phone }
  })
  return res.data
}

export async function getUserInfoByName(name: string) {
  let res = await instance<ApiResponse<GetUserInfoResp>>({
    method: 'get',
    url: userServer + '/user/userInfo',
    params: { name }
  })
  return res.data
}

export async function updateUserInfo(data: UpdateUserInfoRequest) {
  return await instance.put(userServer + '/user/updateInfo', data)
}

export async function refreshToken() {
  return instance.get(userServer + '/user/refresh')
}