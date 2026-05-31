
import instance, { decodeResponse, ApiResponse } from '@/utils/request'
import { ApiTypes } from '@/types'
import qs from 'qs'
import { APP_CONSTANTS as config } from '@/config/constants';


// ==================== ImTypes.GroupInfo APIs ====================

/**
 * 创建群组
 * POST /group/create
 */
export async function createGroup(data: ApiTypes.group.CreateGroupReq) {
    // CreateGroupReq matches interface
    const reqData = ApiTypes.group.CreateGroupReq.encode(data).finish()
    const res = await instance<ApiResponse<ApiTypes.group.CreateGroupResp>>({
        method: 'post',
        url: config.groupServer + '/group/create',
        data: reqData
    })
    return decodeResponse(res.data, ApiTypes.group.CreateGroupResp.decode)
}

/**
 * 获取群组信息 (支持批量)
 * GET /group/info
 */
export async function getGroupInfo(params: {
    group_id: number[];
    limit?: number;
    offset?: number;
}) {
    const res = await instance<ApiResponse<ApiTypes.group.GetGroupResp>>({
        method: 'get',
        url: config.groupServer + '/group/info',
        params,
        paramsSerializer: params => qs.stringify(params, { arrayFormat: 'repeat' })
    })
    return decodeResponse(res.data, ApiTypes.group.GetGroupResp.decode)
}

/**
 * 获取用户所在群组列表
 * GET /group/list
 */
export async function getUserGroups(params: { page?: number; page_size?: number } = {}) {
    // GetUserGroupsReq is empty in proto?
    // message GetUserGroupsReq {}
    // But function accepts page/page_size.
    // Proto definition might be incomplete/different.
    // Let's pass params as is.
    const res = await instance<ApiResponse<ApiTypes.group.GetUserGroupsResp>>({
        method: 'get',
        url: config.groupServer + '/group/list',
        params
    })
    return decodeResponse(res.data, ApiTypes.group.GetUserGroupsResp.decode)
}

/**
 * 更新群组信息
 * PUT /group/update
 */
export async function updateGroup(data: ApiTypes.group.UpdateGroupReq) {
    const reqData = ApiTypes.group.UpdateGroupReq.encode(data).finish()
    const res = await instance.put(config.groupServer + '/group/update', reqData)
    return res.data
}

/**
 * 解散群组
 * DELETE /group/dismiss
 */
export async function dismissGroup(data: ApiTypes.group.DismissGroupReq) {
    const res = await instance<ApiResponse<null>>({
        method: 'delete',
        url: config.groupServer + '/group/dismiss',
        data
    })
    return res.data
}

// ==================== ImTypes.GroupInfo Apply APIs ====================

/**
 * 申请加入群聊
 * POST /group/apply/join
 */
export async function joinGroup(data: ApiTypes.group.JoinGroupReq) {
    const reqData = ApiTypes.group.JoinGroupReq.encode(data).finish()
    const res = await instance<ApiResponse<ApiTypes.group.JoinGroupResp>>({
        method: 'post',
        url: config.groupServer + '/group/apply/join',
        data: reqData
    })
    return decodeResponse(res.data, ApiTypes.group.JoinGroupResp.decode)
}

/**
 * 处理群申请
 * PUT /group/apply/handle
 */
export async function handleGroupApply(data: ApiTypes.group.HandleGroupApplyReq) {
    const reqData = ApiTypes.group.HandleGroupApplyReq.encode(data).finish()
    const res = await instance<ApiResponse<ApiTypes.group.HandleGroupApplyResp>>({
        method: 'put',
        url: config.groupServer + '/group/apply/handle',
        data: reqData
    })
    return decodeResponse(res.data, ApiTypes.group.HandleGroupApplyResp.decode)
}

/**
 * 获取待处理的群申请
 * GET /group/apply/pending
 */
export async function getPendingGroupApplies(params: { page?: number; page_size?: number } = {}) {
    const res = await instance<ApiResponse<ApiTypes.group.GetPendingAppliesResp>>({
        method: 'get',
        url: config.groupServer + '/group/apply/pending',
        params
    })
    return decodeResponse(res.data, ApiTypes.group.GetPendingAppliesResp.decode)
}

// ==================== ImTypes.GroupInfo Member APIs ====================

/**
 * 邀请用户加入群
 * POST /group/member/invite
 */
export async function inviteMembers(data: ApiTypes.group.InviteMembersReq) {
    const reqData = ApiTypes.group.InviteMembersReq.encode(data).finish()
    const res = await instance<ApiResponse<ApiTypes.group.InviteMembersResp>>({
        method: 'post',
        url: config.groupServer + '/group/member/invite',
        data: reqData
    })
    return decodeResponse(res.data, ApiTypes.group.InviteMembersResp.decode)
}

/**
 * 退出群聊
 * POST /group/member/leave
 */
export async function leaveGroup(data: ApiTypes.group.LeaveGroupReq) {
    const reqData = ApiTypes.group.LeaveGroupReq.encode(data).finish()
    const res = await instance<ApiResponse<null>>({
        method: 'post',
        url: config.groupServer + '/group/member/leave',
        data: reqData
    })
    return res.data
}

/**
 * 移除群成员
 * DELETE /group/member/remove
 */
export async function removeMember(data: ApiTypes.group.RemoveMemberReq) {
    const res = await instance<ApiResponse<null>>({
        method: 'delete',
        url: config.groupServer + '/group/member/remove',
        data
    })
    return res.data
}

/**
 * 设置群成员角色
 * PUT /group/member/role
 */
export async function setMemberRole(data: ApiTypes.group.SetMemberRoleReq) {
    const reqData = ApiTypes.group.SetMemberRoleReq.encode(data).finish()
    const res = await instance.put(config.groupServer + '/group/member/role', reqData)
    return res.data
}

/**
 * 禁言群成员
 * PUT /group/member/mute
 */
export async function muteMember(data: ApiTypes.group.MuteMemberReq) {
    const reqData = ApiTypes.group.MuteMemberReq.encode(data).finish()
    const res = await instance.put(config.groupServer + '/group/member/mute', reqData)
    return res.data
}

/**
 * 设置群内昵称
 * PUT /group/member/nickname
 */
export async function setMemberNickname(data: ApiTypes.group.SetMemberNicknameReq) {
    const reqData = ApiTypes.group.SetMemberNicknameReq.encode(data).finish()
    const res = await instance.put(config.groupServer + '/group/member/nickname', reqData)
    return res.data
}
