
import instance, { decodeResponse, ApiResponse } from '@/src/utils/request'
import { ApiTypes, PartialExcept } from '@shared/types'
import { APP_CONSTANTS as config } from '@shared/config/constants'


// ==================== Session APIs ====================

/**
 * 按 session_id 或 session_key 查询会话（按 key 查询且不存在时服务端会创建）
 * GET 请求走 query 参数（后端 form 绑定）；session_type 用服务端 model 值（1=单聊, 2=群聊）
 */
export async function getSession(params: Partial<ApiTypes.message.GetSessionReq>) {
    const res = await instance<ApiResponse<ApiTypes.message.GetSessionResp>>({
        method: 'get',
        url: config.messageServer + '/message/session',
        params
    })
    return decodeResponse(res.data, ApiTypes.message.GetSessionResp.decode)
}


/**
 * 更新会话设置 (置顶、免打扰、静音等)
 * PUT /message/session
 */
export async function updateSession(data: ApiTypes.message.UpdateSessionReq) {
    const reqData = ApiTypes.message.UpdateSessionReq.encode(data).finish()
    const res = await instance<ApiResponse<null>>({
        method: 'put',
        url: config.messageServer + '/message/session',
        data: reqData
    })
    return res.data
}

/**
 * 上报会话已读游标（服务端单调前进，乱序上报不会回退）
 * PUT /message/session/read
 */
export async function markSessionRead(data: ApiTypes.message.MarkSessionReadReq) {
    const reqData = ApiTypes.message.MarkSessionReadReq.encode(data).finish()
    const res = await instance<ApiResponse<null>>({
        method: 'put',
        url: config.messageServer + '/message/session/read',
        data: reqData
    })
    return res.data
}

/**
 * 获取用户的会话列表（含服务端计算的 unread_count 与 last_read_seq）
 * GET /message/sessions/user
 */
export async function getUserSessions() {
    const res = await instance<ApiResponse<ApiTypes.message.GetUserSessionsResp>>({
        method: 'get',
        url: config.messageServer + '/message/sessions/user'
    })
    return decodeResponse(res.data, ApiTypes.message.GetUserSessionsResp.decode)
}

// ==================== Message APIs ====================

/**
 * 获取历史消息 (分页)
 * GET /message/history
 * | 参数名 | 类型 | 必填 | 默认 | 说明 |
 * | --- | --- | --- | --- | --- |
 * | session_id | string | 否 | - | 会话ID |
 * | start_seq | uint64 | 否 | 0 | 起始序号（含） |
 * | end_seq | uint64 | 否 | 0 | 结束序号（含） |
 * | limit | int | 否 | 20 | 每次拉取的消息条数 |
 */
export async function getHistory(params: PartialExcept<ApiTypes.message.GetHistoryReq, 'session_id'>) {
    const res = await instance<ApiResponse<ApiTypes.message.GetHistoryResp>>({
        method: 'get',
        url: config.messageServer + '/message/history',
        params
    })
    return decodeResponse(res.data, ApiTypes.message.GetHistoryResp.decode)
}

// 获取离线后的活跃列表
export async function getUserActiveSessions(params: ApiTypes.message.GetUserActiveSessionsReq) {
    const res = await instance<ApiResponse<ApiTypes.message.GetUserActiveSessionsResp>>({
        method: 'get',
        url: config.messageServer + '/message/sessions/user/active',
        params
    })
    return decodeResponse(res.data, ApiTypes.message.GetUserActiveSessionsResp.decode)
}
