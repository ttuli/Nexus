
import instance, { decodeResponse, ApiResponse } from '@/utils/request'
import { ApiTypes, PartialExcept } from '@/types'
import { config } from '@/config'


// ==================== Conversation APIs ====================

/**
 * 更新会话设置 (置顶、免打扰、静音等)
 * PUT /message/conversation
 */
export async function updateConversation(data: ApiTypes.message.UpdateConversationReq) {
    const res = await instance<ApiResponse<null>>({
        method: 'put',
        url: config.messageServer + '/message/conversation',
        data
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
    const res = await instance<ApiResponse<null>>({
        method: 'post',
        url: config.messageServer + '/message/read',
        data
    })
    return res.data
}
