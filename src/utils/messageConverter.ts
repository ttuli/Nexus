/**
 * 消息转换器
 * 负责将 WebSocket / API 消息格式转换为本地统一的 IChatMessage 格式
 */

import {
    ImTypes, IChatMessage, ILocalTextMessage, ILocalImageMessage,
    ILocalVideoMessage, ILocalAudioMessage, ILocalFileMessage, ILocalSystemMessage,
} from '@/src/types';

/**
 * 将 WebSocket 推送的 WSMessage 转换为本地 IChatMessage 格式
 * @param wsMsg 来自 protobuf 解码的 WSMessage
 * @returns IChatMessage，不支持的消息类型返回 null
 */
export function convertWSMessageToIChatMessage(wsMsg: ImTypes.WSMessage): IChatMessage | null {
    if (!wsMsg.payload || !wsMsg.type) {
        return null;
    }

    let base: ImTypes.BaseMessage | undefined | null;
    let contentObj: any;

    try {
        switch (wsMsg.type) {
            case ImTypes.MessageType.CHAT_TEXT:
            case ImTypes.MessageType.GROUP_TEXT: {
                const textMsg = ImTypes.TextMessage.decode(wsMsg.payload);
                base = textMsg.base;
                contentObj = textMsg;
                break;
            }
            case ImTypes.MessageType.CHAT_IMAGE:
            case ImTypes.MessageType.GROUP_IMAGE: {
                const imgMsg = ImTypes.ImageMessage.decode(wsMsg.payload);
                base = imgMsg.base;
                contentObj = imgMsg;
                break;
            }
            case ImTypes.MessageType.CHAT_VIDEO:
            case ImTypes.MessageType.GROUP_VIDEO: {
                const videoMsg = ImTypes.VideoMessage.decode(wsMsg.payload);
                base = videoMsg.base;
                contentObj = videoMsg;
                break;
            }
            case ImTypes.MessageType.CHAT_FILE:
            case ImTypes.MessageType.GROUP_FILE: {
                const fileMsg = ImTypes.FileMessage.decode(wsMsg.payload);
                base = fileMsg.base;
                contentObj = fileMsg;
                break;
            }
            case ImTypes.MessageType.CHAT_AUDIO:
            case ImTypes.MessageType.GROUP_AUDIO: {
                const audioMsg = ImTypes.AudioMessage.decode(wsMsg.payload);
                base = audioMsg.base;
                contentObj = audioMsg;
                break;
            }
            default:
                return null;
        }
    } catch (e) {
        console.error('Failed to decode message payload:', e);
        return null;
    }

    if (!base) {
        return null;
    }

    const commonFields = {
        msgId: base.msg_id || '',
        sessionId: base.session_id || '',
        sessionKey: base.session_key || '',
        fromUserId: base.from_user_id || 0,
        target: base.target || 0,
        sendTime: base.send_time || 0,
        seq: base.msg_seq || 0,
        status: (base.status as unknown as ImTypes.MessageStatus) || ImTypes.MessageStatus.MESSAGE_STATUS_UNSPECIFIED,
        isRead: false,
        clientId: base.client_id || '',
        ext: base.ext || undefined
    };

    if (wsMsg.type === ImTypes.MessageType.CHAT_TEXT || wsMsg.type === ImTypes.MessageType.GROUP_TEXT) {
        const textMsg = contentObj as ImTypes.TextMessage;
        return {
            ...commonFields,
            type: wsMsg.type,
            content: textMsg.content || '',
            atList: textMsg.at_list || []
        } as ILocalTextMessage;
    }

    if (wsMsg.type === ImTypes.MessageType.CHAT_IMAGE || wsMsg.type === ImTypes.MessageType.GROUP_IMAGE) {
        const imageMsg = contentObj as ImTypes.ImageMessage;
        return {
            ...commonFields,
            type: wsMsg.type,
            url: imageMsg.url || '',
            thumbnailUrl: imageMsg.thumbnail_url,
            thumbnailHeight: imageMsg.thumbnail_height || 0,
            thumbnailWidth: imageMsg.thumbnail_width || 0,
            width: imageMsg.width || 0,
            height: imageMsg.height || 0,
            size: imageMsg.size || 0,
            format: imageMsg.format || '',
            fileName: imageMsg.file_name || ''
        } as ILocalImageMessage;
    }

    if (wsMsg.type === ImTypes.MessageType.CHAT_VIDEO || wsMsg.type === ImTypes.MessageType.GROUP_VIDEO) {
        const videoMsg = contentObj as ImTypes.VideoMessage;
        return {
            ...commonFields,
            type: wsMsg.type,
            url: videoMsg.url || '',
            thumbnailUrl: videoMsg.thumbnail_url,
            thumbnailHeight: videoMsg.thumbnail_height || 0,
            thumbnailWidth: videoMsg.thumbnail_width || 0,
            duration: videoMsg.duration || 0,
            width: videoMsg.width || 0,
            height: videoMsg.height || 0,
            size: videoMsg.size || 0,
            format: videoMsg.format || '',
            fileName: videoMsg.file_name || ''
        } as ILocalVideoMessage;
    }

    if (wsMsg.type === ImTypes.MessageType.CHAT_FILE || wsMsg.type === ImTypes.MessageType.GROUP_FILE) {
        const fileMsg = contentObj as ImTypes.FileMessage;
        return {
            ...commonFields,
            type: wsMsg.type,
            url: fileMsg.url || '',
            fileName: fileMsg.file_name || '',  // ts-proto 解码后字段为 snake_case
            size: fileMsg.size || 0,
        } as ILocalFileMessage;
    }

    if (wsMsg.type === ImTypes.MessageType.CHAT_AUDIO || wsMsg.type === ImTypes.MessageType.GROUP_AUDIO) {
        const audioMsg = contentObj as ImTypes.AudioMessage;
        return {
            ...commonFields,
            type: wsMsg.type,
            url: audioMsg.url || '',
            duration: audioMsg.duration || 0,
            size: audioMsg.size || 0,
            format: audioMsg.format || '',
        } as ILocalAudioMessage;
    }

    return null;
}

/**
 * 将群组操作通知转换为本地系统消息格式
 */
export function convertNotificationToChatMessage(notification: ImTypes.GroupNotification): IChatMessage {
    const sessionKey = String(notification.group_id);
    const chatMsg: ILocalSystemMessage = {
        type: ImTypes.MessageType.GROUP_OP_NOTIFICATION,
        opType: notification.op_type,
        groupId: notification.group_id,
        targetIds: notification.target_ids,
        reason: notification.reason,

        msgId: notification.msg_id,
        sessionId: notification.session_id || '',
        sessionKey: sessionKey,
        sendTime: notification.op_time,
        fromUserId: notification.operator_id,
        seq: 0,
        status: ImTypes.MessageStatus.MESSAGE_STATUS_UNSPECIFIED,
        isRead: false,
        clientId: '',
    };
    return chatMsg;
}
/**
 * 将申请来源枚举转换为好友来源枚举
 */
export function convertApplySrc2FriendSrc(src: ImTypes.ApplySource): ImTypes.FriendSource {
    switch (src) {
        case ImTypes.ApplySource.APPLY_SOURCE_SEARCH_ACCOUNT:
        case ImTypes.ApplySource.APPLY_SOURCE_SEARCH_PHONE:
        case ImTypes.ApplySource.APPLY_SOURCE_SEARCH_NAME:
            return ImTypes.FriendSource.FRIEND_SOURCE_SEARCH;
        case ImTypes.ApplySource.APPLY_SOURCE_FROM_GROUP:
            return ImTypes.FriendSource.FRIEND_SOURCE_GROUP;
        case ImTypes.ApplySource.APPLY_SOURCE_FROM_RECOMMEND:
            return ImTypes.FriendSource.FRIEND_SOURCE_RECOMMEND;
        case ImTypes.ApplySource.APPLY_SOURCE_UNSPECIFIED:
        default:
            return ImTypes.FriendSource.FRIEND_SOURCE_UNSPECIFIED;
    }
}

/**
 * 格式化系统消息内容，返回可读的中文描述
 */
export function formatSystemMessage(
    message: ILocalSystemMessage,
    meId?: number,
    getUserName?: (userId: number) => string
): string {
    const resolveUserName = (userId: number) => {
        if (!userId) return '';
        if (meId !== undefined && userId === meId) return '你';
        if (getUserName) {
            const name = getUserName(userId);
            if (name) return name;
        }
        return `用户${userId}`;
    };

    if (message.content) {
        return message.content;
    }

    const { opType, fromUserId, targetIds = [], reason } = message;
    const operatorName = resolveUserName(fromUserId);
    const isSelf = meId !== undefined && fromUserId === meId;

    if (message.type === ImTypes.MessageType.MSG_RECALL) {
        if (message.targetIds?.length && message.targetIds[0] === message.groupId) {
            return `${operatorName} 撤回了一条消息`;
        } else {
            return isSelf ? '你撤回了一条消息' : '对方撤回了一条消息';
        }
    }

    const firstTargetName = targetIds.length > 0 ? resolveUserName(targetIds[0]) : '';
    const targetsDesc = targetIds.length > 1 ? `${firstTargetName}等` : firstTargetName;

    switch (opType) {
        case ImTypes.GroupOperationType.GROUP_OP_CREATE:
            return `${operatorName} 邀请 ${targetsDesc} 加入了群聊`;
        case ImTypes.GroupOperationType.GROUP_OP_DISMISS:
            return `${operatorName} 解散了群组`;
        case ImTypes.GroupOperationType.GROUP_OP_JOIN:
            return `${operatorName} 加入了群聊`;
        case ImTypes.GroupOperationType.GROUP_OP_LEAVE:
            return `${operatorName} 退出了群聊`;
        case ImTypes.GroupOperationType.GROUP_OP_KICK:
            return `${targetsDesc} 被 ${operatorName} 移出群聊${reason ? ' (' + reason + ')' : ''}`;
        case ImTypes.GroupOperationType.GROUP_OP_INVITE:
            return `${operatorName} 邀请 ${targetsDesc} 加入了群聊`;
        case ImTypes.GroupOperationType.GROUP_OP_UPDATE_INFO:
            return `${operatorName} 修改了群信息`;
        case ImTypes.GroupOperationType.GROUP_OP_MUTE:
            return `${operatorName} 禁言了 ${targetsDesc}${reason ? ' (' + reason + ')' : ''}`;
        case ImTypes.GroupOperationType.GROUP_OP_UNMUTE:
            return `${operatorName} 解除了 ${targetsDesc} 的禁言`;
        default:
            return '系统消息';
    }
}

/**
 * 根据消息类型生成会话列表中展示的最后一条消息预览文字
 * @param message 本地消息对象
 * @returns 预览字符串，如 '[图片]'、'[文件]' 或文本内容
 */
export function getLastContent(
    message: IChatMessage,
): string {
    let content: string = '';
    switch (message.type) {
        case ImTypes.MessageType.CHAT_TEXT:
        case ImTypes.MessageType.GROUP_TEXT:
            content = (message as any).content ?? '';
            break;
        case ImTypes.MessageType.CHAT_IMAGE:
        case ImTypes.MessageType.GROUP_IMAGE:
            content = '[图片]';
            break;
        case ImTypes.MessageType.CHAT_FILE:
        case ImTypes.MessageType.GROUP_FILE:
            content = '[文件]';
            break;
        case ImTypes.MessageType.CHAT_VIDEO:
        case ImTypes.MessageType.GROUP_VIDEO:
            content = '[视频]';
            break;
        case ImTypes.MessageType.CHAT_AUDIO:
        case ImTypes.MessageType.GROUP_AUDIO:
            content = '[音频]';
            break;
        default:
            content = '[消息]';
            break;
    }
    return content
}
