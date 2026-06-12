import instance, { decodeResponse, ApiResponse } from '@/src/utils/request'
import { ApiTypes } from '@/src/types'
import { APP_CONSTANTS as config } from '@/src/config/constants';

/**
 * 更新个人信息
 * PUT /user/info
 */
export async function updateUserInfo(data: ApiTypes.user.UpdateInfoReq) {
  // UpdateInfoReq is a plain object now with snake_case keys
  const reqData = ApiTypes.user.UpdateInfoReq.encode(data).finish()
  let res = await instance.put(config.userServer + '/user/info', reqData)
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
  const reqData = ApiTypes.user.UpdateFriendReq.encode(data).finish()
  let res = await instance<ApiResponse<ApiTypes.user.UpdateFriendResp>>({
    method: 'put',
    url: config.userServer + '/user/friend/update',
    data: reqData
  })
  return decodeResponse(res.data, ApiTypes.user.UpdateFriendResp.decode)
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
  const reqData = ApiTypes.user.CreateFriendReq.encode(data).finish()
  let res = await instance<ApiResponse<ApiTypes.user.CreateFriendResp>>({
    method: 'post',
    url: config.userServer + '/user/friend/create',
    data: reqData
  })
  return decodeResponse(res.data, ApiTypes.user.CreateFriendResp.decode)
}

// ==================== Friend Apply APIs ====================

/**
 * 发起好友申请
 * POST /user/friend/apply/new
 */
export async function applyFriend(data: ApiTypes.user.NewFriendApplyReq) {
  const reqData = ApiTypes.user.NewFriendApplyReq.encode(data).finish()
  let res = await instance<ApiResponse<ApiTypes.user.NewFriendApplyResp>>({
    method: 'post',
    url: config.userServer + '/user/friend/apply/new',
    data: reqData
  })
  return decodeResponse(res.data, ApiTypes.user.NewFriendApplyResp.decode)
}

/**
 * 处理好友申请
 * PUT /user/friend/apply/handle
 */
export async function handleFriendApply(data: ApiTypes.user.HandleFriendApplyReq) {
  const reqData = ApiTypes.user.HandleFriendApplyReq.encode(data).finish()
  let res = await instance<ApiResponse<ApiTypes.user.HandleFriendApplyResp>>({
    method: 'put',
    url: config.userServer + '/user/friend/apply/handle',
    data: reqData
  })
  return decodeResponse(res.data, ApiTypes.user.HandleFriendApplyResp.decode)
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