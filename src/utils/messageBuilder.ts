/**
 * 消息构建器
 * 负责构建用于 WebSocket 发送的各类消息载荷，以及对应的本地占位消息
 */

import {
    ImTypes, IChatMessage,
    ILocalTextMessage, ILocalImageMessage,
    ILocalVideoMessage, ILocalAudioMessage, ILocalFileMessage,
} from '@/src/types';
import { Renderer_Config as config } from '@/src/config/constants';
import { useUserStore } from '@/src/store/user';
import { useConversationStore } from '@/src/store/conversation';
import { ulid } from 'ulid';
import { extractTargetIdFromSessionId } from './sessionUtils';

// ─── Content type definitions ────────────────────────────────────────────────

export interface ImageContent {
    url: string;
    thumbnailUrl?: string;
    localPath?: string;
    uploadProgress?: number;
    width?: number;
    height?: number;
    thumbnailWidth?: number;
    thumbnailHeight?: number;
    size?: number;
    format?: string;
    fileName?: string;
}

export interface FileContent {
    url: string;
    localPath?: string;
    uploadProgress?: number;
    fileName?: string;
    size?: number;
    format?: string;
}

export interface AudioContent {
    url: string;
    localPath?: string;      // 本地文件路径（发送时预览用）
    uploadProgress?: number;
    duration?: number;       // 时长（秒），发送时若获取不到填 0
    size?: number;
    format?: string;         // 音频 MIME 类型，如 audio/mp3
}

export interface VideoContent {
    url: string;
    localPath?: string;
    uploadProgress?: number;
    thumbnailUrl?: string;
    duration?: number;
    width?: number;
    height?: number;
    thumbnailWidth?: number;
    thumbnailHeight?: number;
    size?: number;
    format?: string;
    fileName?: string;
}

// ─── Return type ─────────────────────────────────────────────────────────────

export interface WsMessageResult<T extends IChatMessage = IChatMessage> {
    msg: ImTypes.WSMessage;
    clientId: string;
    localMsg: T;
}

// ─── Shared base builder (private) ───────────────────────────────────────────

function buildBase(type: ImTypes.MessageType, sessionId: string, existingClientId?: string) {
    const userStore = useUserStore();
    const conversationStore = useConversationStore();
    const currentChat = conversationStore.getChat(sessionId);
    const convKey = currentChat?.conv_key || sessionId;
    const conversationId = currentChat?.conversation_id || '';

    const clientId = existingClientId ?? ulid();

    const isGroupMsg = [
        ImTypes.MessageType.GROUP_TEXT,
        ImTypes.MessageType.GROUP_IMAGE,
        ImTypes.MessageType.GROUP_VIDEO,
        ImTypes.MessageType.GROUP_FILE,
        ImTypes.MessageType.GROUP_AUDIO,
        ImTypes.MessageType.GROUP_OP_NOTIFICATION
    ].includes(type);

    let targetId: number;
    let targetType: ImTypes.TargetType;
    if (isGroupMsg) {
        targetType = ImTypes.TargetType.GROUP;
    } else {
        targetType = ImTypes.TargetType.USER;
    }

    targetId = extractTargetIdFromSessionId(convKey, userStore.getUserID()) || 0;

    const baseMsg: ImTypes.BaseMessage = {
        msg_id: '',
        session_id: conversationId,
        conv_key: convKey,
        from_user_id: userStore.getUserID(),
        target: targetId,
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
        sender_id: 0,
        route_target: [targetId],
        route_target_type: targetType,
    };

    const commonFields = {
        msgId: '',
        sessionId: conversationId || convKey,
        convKey,
        fromUserId: userStore.getUserID(),
        sendTime: baseMsg.send_time,
        seq: 0,
        status: ImTypes.MessageStatus.MESSAGE_STATUS_SENDING,
        isRead: true,
        clientId,
        preview: '',
        ext: undefined as undefined,
    };

    return { clientId, baseMsg, wsMsg, commonFields };
}

// ─── Per-type builders ────────────────────────────────────────────────────────

/**
 * 构建文本消息的 WS 包和占位本地消息
 */
export function buildTextWsMessage(
    content: string,
    sessionId: string,
    conversationType: ImTypes.ConversationType
): WsMessageResult<ILocalTextMessage> {
    const isGroup = conversationType === ImTypes.ConversationType.CONVERSATION_TYPE_GROUP;
    const type = isGroup ? ImTypes.MessageType.GROUP_TEXT : ImTypes.MessageType.CHAT_TEXT;
    const { clientId, baseMsg, wsMsg, commonFields } = buildBase(type, sessionId);

    wsMsg.payload = ImTypes.TextMessage.encode({ base: baseMsg, content, at_list: [] }).finish();
    const localMsg: ILocalTextMessage = { ...commonFields, type, content, atList: [] };
    return { msg: wsMsg, clientId, localMsg };
}

/**
 * 仅构建图片占位本地消息（不含 WS payload），用于上传前立即塞入 store 显示预览
 */
export function buildImageLocalMsg(
    content: ImageContent,
    sessionId: string,
    conversationType: ImTypes.ConversationType
): { clientId: string; localMsg: ILocalImageMessage } {
    const isGroup = conversationType === ImTypes.ConversationType.CONVERSATION_TYPE_GROUP;
    const type = isGroup ? ImTypes.MessageType.GROUP_IMAGE : ImTypes.MessageType.CHAT_IMAGE;
    const { clientId, commonFields } = buildBase(type, sessionId);

    const localMsg: ILocalImageMessage = {
        ...commonFields,
        type,
        url: content.url,
        localPath: content.localPath,
        thumbnailUrl: content.thumbnailUrl,
        uploadProgress: content.uploadProgress,
        width: content.width || 0,
        height: content.height || 0,
        thumbnailWidth: content.thumbnailWidth || 0,
        thumbnailHeight: content.thumbnailHeight || 0,
        size: content.size || 0,
        format: content.format || '',
        fileName: content.fileName || ''
    };
    return { clientId, localMsg };
}

/**
 * 根据已有的图片本地消息（clientId）和最终 OSS URL 构建 WS 发送载荷
 * 用于上传完成后发送 WebSocket 消息
 */
export function buildImageWsPayload(
    localMsg: ILocalImageMessage,
    ossUrl: string,
    sessionId: string,
    conversationType: ImTypes.ConversationType
): ImTypes.WSMessage {
    const isGroup = conversationType === ImTypes.ConversationType.CONVERSATION_TYPE_GROUP;
    const type = isGroup ? ImTypes.MessageType.GROUP_IMAGE : ImTypes.MessageType.CHAT_IMAGE;
    const { baseMsg, wsMsg } = buildBase(type, sessionId, localMsg.clientId);

    wsMsg.payload = ImTypes.ImageMessage.encode({
        base: baseMsg,
        url: ossUrl,
        thumbnail_url: localMsg.thumbnailUrl || '',
        width: localMsg.width || 0,
        height: localMsg.height || 0,
        thumbnail_width: localMsg.thumbnailWidth || 0,
        thumbnail_height: localMsg.thumbnailHeight || 0,
        size: localMsg.size || 0,
        format: localMsg.format || '',
        file_name: localMsg.fileName || ''
    }).finish();

    return wsMsg;
}

/**
 * 仅构建文件占位本地消息（不含 WS payload），用于上传前立即塞入 store 显示占位
 */
export function buildFileLocalMsg(
    content: FileContent,
    sessionId: string,
    conversationType: ImTypes.ConversationType
): { clientId: string; localMsg: ILocalFileMessage } {
    const isGroup = conversationType === ImTypes.ConversationType.CONVERSATION_TYPE_GROUP;
    const type = isGroup ? ImTypes.MessageType.GROUP_FILE : ImTypes.MessageType.CHAT_FILE;
    const { clientId, commonFields } = buildBase(type, sessionId);

    const localMsg: ILocalFileMessage = {
        ...commonFields,
        type,
        url: content.url,
        localPath: content.localPath,
        uploadProgress: content.uploadProgress,
        fileName: content.fileName || '',
        size: content.size || 0,
        format: content.format || '',
    };
    return { clientId, localMsg };
}

/**
 * 根据已有的文件本地消息和最终 OSS URL 构建 WS 发送载荷
 * 用于上传完成后发送 WebSocket 消息
 */
export function buildFileWsPayload(
    localMsg: ILocalFileMessage,
    ossUrl: string,
    sessionId: string,
    conversationType: ImTypes.ConversationType
): ImTypes.WSMessage {
    const isGroup = conversationType === ImTypes.ConversationType.CONVERSATION_TYPE_GROUP;
    const type = isGroup ? ImTypes.MessageType.GROUP_FILE : ImTypes.MessageType.CHAT_FILE;
    const { baseMsg, wsMsg } = buildBase(type, sessionId, localMsg.clientId);

    wsMsg.payload = ImTypes.FileMessage.encode({
        base: baseMsg,
        url: ossUrl,
        file_name: localMsg.fileName || '',
        size: localMsg.size || 0,
        format: localMsg.format || '',
        md5: ''
    }).finish();

    return wsMsg;
}

/**
 * 构建音频消息的 WS 包和占位本地消息
 * content.url 为空时表示占位消息（上传前），有值时表示结果消息（上传后）
 */
export function buildAudioWsMessage(
    content: AudioContent,
    sessionId: string,
    conversationType: ImTypes.ConversationType,
    existingClientId?: string
): WsMessageResult<ILocalAudioMessage> {
    const isGroup = conversationType === ImTypes.ConversationType.CONVERSATION_TYPE_GROUP;
    const type = isGroup ? ImTypes.MessageType.GROUP_AUDIO : ImTypes.MessageType.CHAT_AUDIO;
    const { clientId, baseMsg, wsMsg, commonFields } = buildBase(type, sessionId, existingClientId);

    wsMsg.payload = ImTypes.AudioMessage.encode({
        base: baseMsg,
        url: content.url,
        duration: content.duration || 0,
        size: content.size || 0,
        format: content.format || '',
        is_read: false,
    }).finish();

    const localMsg: ILocalAudioMessage = {
        ...commonFields,
        type,
        url: content.url,
        localPath: content.localPath,
        uploadProgress: content.uploadProgress,
        duration: content.duration || 0,
        size: content.size || 0,
        format: content.format || '',
    };
    return { msg: wsMsg, clientId, localMsg };
}

/**
 * 仅构建视频占位本地消息（不含 WS payload），用于上传前立即塞入 store 显示预览
 */
export function buildVideoLocalMsg(
    content: VideoContent,
    sessionId: string,
    conversationType: ImTypes.ConversationType
): { clientId: string; localMsg: ILocalVideoMessage } {
    const isGroup = conversationType === ImTypes.ConversationType.CONVERSATION_TYPE_GROUP;
    const type = isGroup ? ImTypes.MessageType.GROUP_VIDEO : ImTypes.MessageType.CHAT_VIDEO;
    const { clientId, commonFields } = buildBase(type, sessionId);

    const localMsg: ILocalVideoMessage = {
        ...commonFields,
        type,
        url: content.url,
        localPath: content.localPath,
        uploadProgress: content.uploadProgress,
        thumbnailUrl: content.thumbnailUrl,
        duration: content.duration || 0,
        width: content.width || 0,
        height: content.height || 0,
        size: content.size || 0,
        format: content.format || '',
        fileName: content.fileName || '',
        thumbnailHeight: content.thumbnailHeight || 0,
        thumbnailWidth: content.thumbnailWidth || 0,
    };
    return { clientId, localMsg };
}

/**
 * 根据已有的视频本地消息和最终 OSS URL 构建 WS 发送载荷
 * 用于上传完成后发送 WebSocket 消息
 */
export function buildVideoWsPayload(
    localMsg: ILocalVideoMessage,
    ossUrl: string,
    sessionId: string,
    conversationType: ImTypes.ConversationType
): ImTypes.WSMessage {
    const isGroup = conversationType === ImTypes.ConversationType.CONVERSATION_TYPE_GROUP;
    const type = isGroup ? ImTypes.MessageType.GROUP_VIDEO : ImTypes.MessageType.CHAT_VIDEO;
    const { baseMsg, wsMsg } = buildBase(type, sessionId, localMsg.clientId);

    wsMsg.payload = ImTypes.VideoMessage.encode({
        base: baseMsg,
        url: ossUrl,
        thumbnail_url: '',
        thumbnail_width: localMsg.thumbnailWidth || 0,
        thumbnail_height: localMsg.thumbnailHeight || 0,
        duration: localMsg.duration || 0,
        width: localMsg.width || 0,
        height: localMsg.height || 0,
        size: localMsg.size || 0,
        format: localMsg.format || '',
        file_name: localMsg.fileName || '',
    }).finish();

    return wsMsg;
}
