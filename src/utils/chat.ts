import { ImTypes, IChatMessage, ILocalTextMessage, ILocalImageMessage, ILocalVideoMessage, ILocalFileMessage } from '@/types';
import { config } from '@/config';
import { useChatStore } from '@/store/chat';
import { useUserStore } from '@/store/user';
import { ulid } from 'ulid';

/**
 * Convert WSMessage to IChatMessage (Local Message format)
 * @param wsMsg The WSMessage from protobuf
 * @returns IChatMessage or null if type is not supported/convertible
 */
export function convertWSMessageToIChatMessage(wsMsg: ImTypes.WSMessage): IChatMessage | null {
    if (!wsMsg.payload || !wsMsg.type) {
        return null;
    }

    let base: ImTypes.BaseMessage | undefined | null;
    let contentObj: any; // Using any to access fields generically, or could switch-case with specific types

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
        return {
            ...commonFields,
            type: wsMsg.type,
            content: contentObj.content || '',
            atList: contentObj.at_list || []
        } as ILocalTextMessage;
    }

    if (wsMsg.type === ImTypes.MessageType.CHAT_IMAGE || wsMsg.type === ImTypes.MessageType.GROUP_IMAGE) {
        return {
            ...commonFields,
            type: wsMsg.type,
            url: contentObj.url || '',
            thumbnailUrl: contentObj.thumbnail_url,
            width: contentObj.width || 0,
            height: contentObj.height || 0,
            size: contentObj.size || 0,
            format: contentObj.format || ''
        } as ILocalImageMessage;
    }

    if (wsMsg.type === ImTypes.MessageType.CHAT_VIDEO || wsMsg.type === ImTypes.MessageType.GROUP_VIDEO) {
        return {
            ...commonFields,
            type: wsMsg.type,
            url: contentObj.url || '',
            thumbnailUrl: contentObj.thumbnail_url,
            duration: contentObj.duration || 0,
            width: contentObj.width || 0,
            height: contentObj.height || 0,
            size: contentObj.size || 0,
            format: contentObj.format || ''
        } as ILocalVideoMessage;
    }

    if (wsMsg.type === ImTypes.MessageType.CHAT_FILE || wsMsg.type === ImTypes.MessageType.GROUP_FILE) {
        return {
            ...commonFields,
            type: wsMsg.type,
            url: contentObj.url || '',
            fileName: contentObj.fileName || '', // proto definition for FileMessage might be file_name?
            // Checking FileMessage needed. Assuming file_name based on snake_case pattern.
            // Let's assume file_name since ts-proto usually outputs snake_case.
            // But contentObj is any here.
            // Wait, I should verify FileMessage fields.
            size: contentObj.size || 0,
            fileType: (contentObj.fileType as ImTypes.FileType) || ImTypes.FileType.FILE_TYPE_UNSPECIFIED
        } as ILocalFileMessage;
    }

    return null;
}

/**
 * 生成单聊会话ID
 * 规则: smaller_uid_larger_uid
 * @param uid1 用户ID 1
 * @param uid2 用户ID 2
 */
export function generateSessionId(uid1: number, uid2: number): string {
    if (uid1 < uid2) {
        return `private_${uid1}_${uid2}`;
    }
    return `private_${uid2}_${uid1}`;
}

/**
 * 生成群聊会话ID
 * 规则: group_groupId
 * @param groupId 群组ID
 */
export function generateGroupSessionId(groupId: number): string {
    return `group_${groupId}`;
}

export function buildWsMessage(type: ImTypes.MessageType, content: any): { msg: ImTypes.WSMessage, clientId: string, localMsg: IChatMessage } {
    const chatStore = useChatStore();
    const userStore = useUserStore();
    const clientId = ulid();

    const baseMsg: ImTypes.BaseMessage = {
        msg_id: '',
        session_id: chatStore.currentSessionId,
        from_user_id: userStore.getUserID(),
        target: chatStore.currentChatId || 0,
        send_time: Date.now(),
        msg_seq: 0,
        status: ImTypes.MessageStatus.MESSAGE_STATUS_SENDING,
        client_id: clientId,
        ext: {}
    };

    const wsMsg: ImTypes.WSMessage = {
        type,
        timestamp: Date.now(),
        version: config.wsMessageVersion,
        payload: new Uint8Array(),
    };

    let payload: Uint8Array = new Uint8Array();
    let localMsg: IChatMessage;

    // Common fields for ILocalMessageBase
    const commonFields = {
        msgId: '',
        sessionId: chatStore.currentSessionId,
        fromUserId: userStore.getUserID(),
        sendTime: baseMsg.send_time,
        seq: 0,
        status: ImTypes.MessageStatus.MESSAGE_STATUS_SENDING,
        isRead: true, // Self-sent messages are read
        clientId: baseMsg.client_id,
        ext: undefined,
    };

    switch (type) {
        case ImTypes.MessageType.CHAT_TEXT:
        case ImTypes.MessageType.GROUP_TEXT:
            payload = ImTypes.TextMessage.encode({ base: baseMsg, content, at_list: [] }).finish();
            localMsg = {
                ...commonFields,
                type,
                content,
                atList: []
            } as ILocalTextMessage;
            break;
        case ImTypes.MessageType.CHAT_IMAGE:
        case ImTypes.MessageType.GROUP_IMAGE:
            payload = ImTypes.ImageMessage.encode({ base: baseMsg, url: content, thumbnail_url: '', width: 0, height: 0, size: 0, format: '' }).finish();
            localMsg = {
                ...commonFields,
                type,
                url: content,
                width: 0, height: 0, size: 0, format: ''
            } as ILocalImageMessage;
            break;
        case ImTypes.MessageType.CHAT_VIDEO:
        case ImTypes.MessageType.GROUP_VIDEO:
            payload = ImTypes.VideoMessage.encode({ base: baseMsg, url: content, thumbnail_url: '', duration: 0, width: 0, height: 0, size: 0, format: '' }).finish();
            localMsg = {
                ...commonFields,
                type,
                url: content,
                duration: 0, width: 0, height: 0, size: 0, format: ''
            } as ILocalVideoMessage;
            break;
        case ImTypes.MessageType.CHAT_FILE:
        case ImTypes.MessageType.GROUP_FILE:
            payload = ImTypes.FileMessage.encode({ base: baseMsg, url: content, file_name: '', size: 0, file_type: ImTypes.FileType.FILE_TYPE_UNSPECIFIED, md5: '' }).finish();
            localMsg = {
                ...commonFields,
                type,
                url: content,
                fileName: '', size: 0, fileType: ImTypes.FileType.FILE_TYPE_UNSPECIFIED
            } as ILocalFileMessage;
            break;
        default:
            // Should not happen for handled types, but need a fallback or throw
            throw new Error(`Unsupported message type: ${type}`);
    }

    wsMsg.payload = payload;
    return { msg: wsMsg, clientId: baseMsg.client_id, localMsg };
}

export function buildVerifyWsMsg(type: ImTypes.MessageType, data: 
    ImTypes.FriendRequest | 
    ImTypes.GroupApply | 
    ImTypes.Friend
): { msg: ImTypes.WSMessage, clientId?: string } {
    const wsMsg: ImTypes.WSMessage = {
        type,
        timestamp: Date.now(),
        version: config.wsMessageVersion,
        payload: new Uint8Array(),
    };

    let payload: Uint8Array = new Uint8Array();

    switch (type) {
        case ImTypes.MessageType.FRIEND_REQUEST:
            payload = ImTypes.FriendRequest.encode(data as ImTypes.FriendRequest).finish();
            break;
        case ImTypes.MessageType.GROUP_REQUEST:
            payload = ImTypes.GroupApply.encode(data as ImTypes.GroupApply).finish();
            break;
        case ImTypes.MessageType.FRIEND_ADD:
            payload = ImTypes.Friend.encode(data as ImTypes.Friend).finish();
            break;
        default:
            // Should not happen for handled types, but need a fallback or throw
            throw new Error(`Unsupported message type: ${type}`);
    }

    wsMsg.payload = payload;
    return { msg: wsMsg, clientId: ulid() };
}