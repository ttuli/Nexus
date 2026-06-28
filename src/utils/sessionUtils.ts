/**
 * 会话 ID 工具函数
 * 负责生成和解析私聊/群聊的 sessionId / conv_key
 */

/**
 * 生成单聊会话ID
 * 规则: smaller_uid_larger_uid
 * @param uid1 用户ID 1
 * @param uid2 用户ID 2
 */
export function generateSessionId(uid1: number, uid2: number): string {
    if (uid1 < uid2) {
        return `${uid1}_${uid2}`;
    }
    return `${uid2}_${uid1}`;
}

/**
 * 生成群聊会话ID (即 conv_key)
 * 规则: groupId 字符串
 * @param groupId 群组ID
 */
export function generateGroupSessionId(groupId: number): string {
    return String(groupId);
}

/**
 * 从 sessionId 中提取目标 ID
 * 供组件、store 或工具函数统一使用
 * 支持老的带前缀格式和新的无前缀格式
 * @param sessionId     会话ID（可能是 conv_key 或 conversation_id）
 * @param currentUserId 当前用户的 user_id
 * @returns 对方的 user_id 或者群组的 group_id，解析失败返回 null
 */
export function extractTargetIdFromSessionId(sessionId: string, currentUserId: number): number | null {
    if (!sessionId) return null;

    const parts = sessionId.split('_');
    if (parts.length === 2) {
        // 私聊: smallerUid_largerUid
        const uid1 = parseInt(parts[0], 10);
        const uid2 = parseInt(parts[1], 10);
        return uid1 === currentUserId ? uid2 : uid1;
    } else if (parts.length === 1) {
        // 群聊: groupId
        const groupId = parseInt(sessionId, 10);
        if (!isNaN(groupId)) {
            return groupId;
        }
    }

    return null;
}
