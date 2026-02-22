
import instance, { decodeResponse, ApiResponse } from '@/utils/request'
import { ApiTypes } from '@/types'
import { config } from '@/config';


// ==================== User APIs ====================

// /**
//  * 获取用户信息 (支持批量)
//  * GET /user/info
//  */
// export async function getUserInfo(ids: number[]) {
//   // ApiTypes.user.GetUserInfoReq expects { ids: number[], ... }
//   // We can pass the object directly to params
//   let res = await instance<ApiResponse<any>>({
//     method: 'get',
//     url: config.userServer + '/user/info',
//     params: { ids },
//     paramsSerializer: params => {
//       return qs.stringify(params, { arrayFormat: 'repeat' })
//     }
//   })
//   return res.data as unknown as ApiTypes.user.GetUserInfoResp
// }

// /**
//  * 根据手机号获取用户信息
//  * GET /user/info
//  */
// export async function getUserInfoByPhone(phone: string) {
//   let res = await instance<ApiResponse<any>>({
//     method: 'get',
//     url: config.userServer + '/user/info',
//     params: { phone }
//   })
//   return res.data as unknown as ApiTypes.user.GetUserInfoResp
// }

// /**
//  * 根据用户名获取用户信息
//  * GET /user/info
//  */
// export async function getUserInfoByName(name: string) {
//   let res = await instance<ApiResponse<any>>({
//     method: 'get',
//     url: config.userServer + '/user/info',
//     params: { name }
//   })
//   return res.data as unknown as ApiTypes.user.GetUserInfoResp
// }

/**
 * 更新个人信息
 * PUT /user/info
 */
export async function updateUserInfo(data: ApiTypes.user.UpdateInfoReq) {
  // UpdateInfoReq is a plain object now with snake_case keys
  let res = await instance.put(config.userServer + '/user/info', data)
  return res.data
}
// ==================== Friend APIs ====================

/**
 * 获取好友列表
 * GET /user/friend/list
 */
export async function getFriendList(params: { limit?: number, offset?: number } = {}) {
  let res = await instance<ApiResponse<ApiTypes.user.GetFriendsResp>>({
    method: 'get',
    url: config.userServer + '/user/friend/list',
    params
  })
  return decodeResponse(res.data, ApiTypes.user.GetFriendsResp.decode)
}

/**
 * 更新好友信息
 * PUT /user/friend/update
 */
export async function updateFriendInfo(data: ApiTypes.user.UpdateFriendReq) {
  let res = await instance.put(config.userServer + '/user/friend/update', data)
  return res.data
}

/**
 * 删除好友
 * DELETE /user/friend/delete
 */
export async function deleteFriend(friend_id: number) {
  // DeleteFriendReq { friend_id: number }
  let res = await instance<ApiResponse<null>>({
    method: 'delete',
    url: config.userServer + '/user/friend/delete',
    data: { friend_id }
  })
  return res.data
}

/**
 * 创建好友 (直接添加)
 * POST /user/friend/create
 */
export async function createFriend(data: ApiTypes.user.CreateFriendReq) {
  let res = await instance.post(config.userServer + '/user/friend/create', data)
  return res.data
}

// ==================== Friend Apply APIs ====================

/**
 * 发起好友申请
 * POST /user/friend/apply/new
 */
export async function applyFriend(data: ApiTypes.user.NewFriendApplyReq) {
  let res = await instance<ApiResponse<ApiTypes.user.NewFriendApplyResp>>({
    method: 'post',
    url: config.userServer + '/user/friend/apply/new',
    data
  })
  return decodeResponse(res.data, ApiTypes.user.NewFriendApplyResp.decode)
}

/**
 * 处理好友申请
 * PUT /user/friend/apply/handle
 */
export async function handleFriendApply(data: ApiTypes.user.HandleFriendApplyReq) {
  let res = await instance.put(config.userServer + '/user/friend/apply/handle', data)
  return res.data
}

/**
 * 获取待处理申请
 * GET /user/friend/apply/pending
 */
export async function getPendingApplies(params: { limit?: number, offset?: number } = {}) {
  let res = await instance<ApiResponse<ApiTypes.user.GetPendingFriendAppliesResp>>({
    method: 'get',
    url: config.userServer + '/user/friend/apply/pending',
    params
  })
  return decodeResponse(res.data, ApiTypes.user.GetPendingFriendAppliesResp.decode)
}