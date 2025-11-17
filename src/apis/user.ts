import instance from '@/utils/request'
import { LoginRequest,LoginResponse,RegisterRequest,UpdateUserInfoRequest } from '@/models/user'
import qs from 'qs'
import { ParseUserInfo,StoreUserInfo } from '@/utils/store'

const userServer = import.meta.env.VITE_USER_SERVER

export async function login(data: LoginRequest) {
  return await instance<LoginResponse>({
    url:userServer+'/user/login',
    method:'post',
    data
  })
}

export async function register(data: RegisterRequest) {
  return await instance.post(userServer+'/user/register', data)
}

export async function getUserInfo(ids: BigInt[]) {
  let res = await instance({
    method:'get',
    url:userServer+'/user/userInfo', 
    params: { ids },
    paramsSerializer: params => qs.stringify(params, { arrayFormat: 'repeat' })
  })
  res.data.data.forEach((u: any) => {
    let user = ParseUserInfo(u)
    StoreUserInfo(user)
  })
  return res
}

export async function getUserInfoByPhone(phone: string) {
  let res = await instance({
    method:'get',
    url:userServer+'/user/userInfo', 
    params: { phone }
  })
  res.data.data.forEach((u: any) => {
    let user = ParseUserInfo(u)
    StoreUserInfo(user)
  })
  return res
}

export async function getUserInfoByName (name: string) {
  let res =  await instance({
    method:'get',
    url:userServer+'/user/userInfo', 
    params: { name }
  })
  res.data.data.forEach((u: any) => {
    let user = ParseUserInfo(u)
    StoreUserInfo(user)
  })
  return res
}

export async function updateUserInfo(data: UpdateUserInfoRequest) {
  let res = await instance.put(userServer+'/user/updateInfo', data)
  return res;
}

export async function refreshToken() {
  return instance.get(userServer+'/user/refresh')
}