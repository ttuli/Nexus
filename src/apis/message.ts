
import instance, { decodeResponse, ApiResponse } from '@/utils/request'
import { ApiTypes, PartialExcept } from '@/types'
import { APP_CONSTANTS as config } from '@/config/constants'


// ==================== Conversation APIs ====================

/**
 * 更新会话设置 (置顶、免打扰、静音等)
 * PUT /message/conversation
 */
export async function updateConversation(data: ApiTypes.message.UpdateConversationReq) {
    const reqData = ApiTypes.message.UpdateConversationReq.encode(data).finish()
    const res = await instance<ApiResponse<null>>({
        method: 'put',
        url: config.messageServer + '/message/conversation',
        data: reqData
    })
    return res.data
}

/**
 * 获取用户的会话列表
 * GET /message/conversations/user
 */
export async function getUserConversations() {
    const res = await instance<ApiResponse<ApiTypes.message.GetUserConversationsResp>>({
        method: 'get',
        url: config.messageServer + '/message/conversations/user'
    })
    return decodeResponse(res.data, ApiTypes.message.GetUserConversationsResp.decode)
}

// ==================== Message APIs ====================

/**
 * 获取历史消息 (分页)
 * GET /message/history
 * | 参数名 | 类型 | 必填 | 默认 | 说明 |
 * | --- | --- | --- | --- | --- |
 * | conversation_id | string | 否 | - | 会话ID |
 * | start_seq | uint64 | 否 | 0 | 起始序号（含） |
 * | end_seq | uint64 | 否 | 0 | 结束序号（含） |
 * | limit | int | 否 | 20 | 每次拉取的消息条数 |
 */
export async function getHistory(params: PartialExcept<ApiTypes.message.GetHistoryReq, 'conversation_id'>) {
    const res = await instance<ApiResponse<ApiTypes.message.GetHistoryResp>>({
        method: 'get',
        url: config.messageServer + '/message/history',
        params
    })
    return decodeResponse(res.data, ApiTypes.message.GetHistoryResp.decode)
}

/**
 * 消息已读上报
 * POST /message/read
 */
export async function readMessage(data: ApiTypes.message.ReadMessageReq) {
    const reqData = ApiTypes.message.ReadMessageReq.encode(data).finish()
    const res = await instance<ApiResponse<null>>({
        method: 'post',
        url: config.messageServer + '/message/read',
        data: reqData
    })
    return res.data
}

// 获取离线后的活跃列表
export async function getUserActiveConversation(params: ApiTypes.message.GetUserActiveConversationsReq) {
    const res = await instance<ApiResponse<ApiTypes.message.GetUserActiveConversationsResp>>({
        method: 'get',
        url: config.messageServer + '/message/conversations/user/active',
        params
    })
    return decodeResponse(res.data, ApiTypes.message.GetUserActiveConversationsResp.decode)
}

// 撤回消息
export async function recallMessage(data: ApiTypes.message.RecallMessageReq) {
    const reqData = ApiTypes.message.RecallMessageReq.encode(data).finish()
    const res = await instance<ApiResponse<null>>({
        method: 'post',
        url: config.messageServer + '/message/recall',
        data: reqData
    })
    return res.data
}
