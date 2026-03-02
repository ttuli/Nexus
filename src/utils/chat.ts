import { ImTypes, IChatMessage, ILocalTextMessage, ILocalImageMessage, ILocalVideoMessage, ILocalFileMessage, ILocalSystemMessage } from '@/types';
import { config } from '@/config';

import { useUserStore } from '@/store/user';
import { ulid } from 'ulid';

/** imlocal:// 协议 Scheme，与主进程 fileCacheManager 中定义保持一致 */
const IMLOCAL_SCHEME = 'imlocal';
/** imcache:// 协议 Scheme，与主进程 fileCacheManager 中定义保持一致 */
const IMCACHE_SCHEME = 'imcache';

/**
 * 将本地文件绝对路径转换为 imlocal:// 协议地址（渲染进程侧）
 * 主进程会拦截此协议，用 nativeImage 缩放后返回图片 buffer，不写入磁盘缓存
 * @param filePath 本地文件绝对路径（Electron File.path 字段）
 * @param maxWidth 缩略图最大宽度，默认 400px
 */
export function toLocalPreviewUrl(filePath: string, maxWidth = 400): string {
    // 使用 URL-safe Base64（浏览器原生 btoa 只支持 latin1，需转义 unicode）
    const encoded = btoa(encodeURIComponent(filePath).replace(/%([0-9A-F]{2})/g, (_, p1) =>
        String.fromCharCode(parseInt(p1, 16))
    )).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    return `${IMLOCAL_SCHEME}://${encoded}?width=${maxWidth}`;
}

/**
 * 将网络 OSS URL 转换为 imcache:// 协议地址（渲染进程侧）
 * 主进程会拦截此协议，下载文件、存入磁盘缓存，并返回。
 * @param url 网络图片地址
 * @param width 图片推荐的渲染宽度
 * @param height 图片推荐的渲染高度
 */
export function toNetworkPreviewUrl(url: string, width?: number, height?: number): string {
    if (!url) return '';
    // 如果已经是 imcache 协议了，就直接返回
    if (url.startsWith(`${IMCACHE_SCHEME}://`)) return url;

    // Base64Url 编码
    const encoded = btoa(encodeURIComponent(url).replace(/%([0-9A-F]{2})/g, (_, p1) =>
        String.fromCharCode(parseInt(p1, 16))
    )).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

    let result = `${IMCACHE_SCHEME}://${encoded}`;
    const params = new URLSearchParams();
    if (width) params.append('width', width.toString());
    if (height) params.append('height', height.toString());

    const qs = params.toString();
    if (qs) result += `?${qs}`;

    return result;
}

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
            fileName: contentObj.file_name || '',  // ts-proto \u89e3\u7801\u540e\u5b57\u6bb5\u4e3a snake_case
            size: contentObj.size || 0,
        } as ILocalFileMessage;
    }

    return null;
}

export function convertNotificationToChatMessage(notification: ImTypes.GroupNotification): IChatMessage {
    const chatMsg: ILocalSystemMessage = {
        type: ImTypes.MessageType.GROUP_OP_NOTIFICATION,
        opType: notification.op_type,
        groupId: notification.group_id,
        targetIds: notification.target_ids,
        reason: notification.reason,

        msgId: notification.msg_id,
        sessionId: notification.session_id,
        sendTime: notification.op_time,
        fromUserId: notification.operator_id,
        seq: 0,
        status: ImTypes.MessageStatus.MESSAGE_STATUS_UNSPECIFIED,
        isRead: false,
        clientId: '',
    }
    return chatMsg;
}

/**
 * 检查文件消息的 localPath 是否实际存在，不存在则清空
 * 适用于接收到新消息时的处理（也适用于发送方查证本地文件是否仍存在）
 */
export function checkAndClearInvalidLocalPath(
    chatMsg: IChatMessage,
    fileService: { checkLocalFileExists(path: string): Promise<boolean> },
    updateLocalPath: (sessionId: string, clientId: string, msgId: string, localPath: string) => void
) {
    const isFileMsgType = (
        chatMsg.type === ImTypes.MessageType.CHAT_FILE ||
        chatMsg.type === ImTypes.MessageType.GROUP_FILE
    );
    if (!isFileMsgType) return;

    const fileMsg = chatMsg as any;
    if (!fileMsg.localPath) return;

    // 漂浮异步检查，不阻塞主流程
    void (async () => {
        const exists = await fileService.checkLocalFileExists(fileMsg.localPath);
        if (!exists) {
            updateLocalPath(chatMsg.sessionId, chatMsg.clientId || '', chatMsg.msgId, '');
        }
    })();
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

/**
 * 分离出从 sessionId 中获取目标 ID 的逻辑
 * 供组件、store或工具函数统一使用
 * @param sessionId 会话ID
 * @param currentUserId 当前用户的 user_id（用于私聊判定对方是谁）
 * @returns 对方的 user_id 或者群组的 group_id
 */
export function extractTargetIdFromSessionId(sessionId: string, currentUserId: number): number | null {
    if (!sessionId) return null;
    const parts = sessionId.split('_');
    if (sessionId.startsWith('group_')) {
        return parseInt(parts[1], 10);
    } else if (sessionId.startsWith('private_') && parts.length >= 3) {
        const uid1 = parseInt(parts[1], 10);
        const uid2 = parseInt(parts[2], 10);
        return uid1 === currentUserId ? uid2 : uid1;
    }
    return null;
}

// ─── Content types ─────────────────────────────────────────────────────────

export interface ImageContent {
    url: string;
    thumbnailUrl?: string;
    localPath?: string;
    uploadProgress?: number;
    width?: number;
    height?: number;
    size?: number;
    format?: string;
}

export interface FileContent {
    url: string;
    localPath?: string;
    uploadProgress?: number;
    fileName?: string;
    size?: number;
}

// ─── Return type ────────────────────────────────────────────────────────────

export interface WsMessageResult<T extends IChatMessage = IChatMessage> {
    msg: ImTypes.WSMessage;
    clientId: string;
    localMsg: T;
}

// ─── Shared base builder (private) ──────────────────────────────────────────

function buildBase(type: ImTypes.MessageType, sessionId: string, existingClientId?: string) {
    const userStore = useUserStore();
    const clientId = existingClientId ?? ulid();

    let targetId: number;
    let targetType: ImTypes.TargetType;
    if (sessionId.startsWith('group_')) {
        targetType = ImTypes.TargetType.GROUP;
    } else {
        targetType = ImTypes.TargetType.USER;
    }

    // 复用刚刚提取的方法
    targetId = extractTargetIdFromSessionId(sessionId, userStore.getUserID()) || 0;

    const baseMsg: ImTypes.BaseMessage = {
        msg_id: '',
        session_id: sessionId,
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
        route_target: targetId,
        route_target_type: targetType,
    };

    const commonFields = {
        msgId: '',
        sessionId,
        fromUserId: userStore.getUserID(),
        sendTime: baseMsg.send_time,
        seq: 0,
        status: ImTypes.MessageStatus.MESSAGE_STATUS_SENDING,
        isRead: true,
        clientId,
        ext: undefined as undefined,
    };

    return { clientId, baseMsg, wsMsg, commonFields };
}

// ─── Per-type builders ───────────────────────────────────────────────────────

/**
 * 构建文本消息的 WS 包和占位本地消息
 */
export function buildTextWsMessage(
    content: string,
    sessionId: string
): WsMessageResult<ILocalTextMessage> {
    const isGroup = sessionId.startsWith('group_');
    const type = isGroup ? ImTypes.MessageType.GROUP_TEXT : ImTypes.MessageType.CHAT_TEXT;
    const { clientId, baseMsg, wsMsg, commonFields } = buildBase(type, sessionId);

    wsMsg.payload = ImTypes.TextMessage.encode({ base: baseMsg, content, at_list: [] }).finish();
    const localMsg: ILocalTextMessage = { ...commonFields, type, content, atList: [] };
    return { msg: wsMsg, clientId, localMsg };
}

/**
 * 构建图片消息的 WS 包和占位本地消息
 * content.url 为空时表示占位消息（上传前），有值时表示结果消息（上传后）
 */
export function buildImageWsMessage(
    content: ImageContent,
    sessionId: string,
    existingClientId?: string
): WsMessageResult<ILocalImageMessage> {
    const isGroup = sessionId.startsWith('group_');
    const type = isGroup ? ImTypes.MessageType.GROUP_IMAGE : ImTypes.MessageType.CHAT_IMAGE;
    const { clientId, baseMsg, wsMsg, commonFields } = buildBase(type, sessionId, existingClientId);

    wsMsg.payload = ImTypes.ImageMessage.encode({
        base: baseMsg,
        url: content.url,
        thumbnail_url: content.thumbnailUrl || '',
        width: content.width || 0,
        height: content.height || 0,
        size: content.size || 0,
        format: content.format || ''
    }).finish();

    const localMsg: ILocalImageMessage = {
        ...commonFields,
        type,
        url: content.url,
        localPath: content.localPath,
        thumbnailUrl: content.thumbnailUrl,
        uploadProgress: content.uploadProgress,
        width: content.width || 0,
        height: content.height || 0,
        size: content.size || 0,
        format: content.format || ''
    };
    return { msg: wsMsg, clientId, localMsg };
}

/**
 * 仅构建图片占位本地消息（不含 WS payload），用于上传前立即塞入 store 显示预览
 */
export function buildImageLocalMsg(
    content: ImageContent,
    sessionId: string
): { clientId: string; localMsg: ILocalImageMessage } {
    const isGroup = sessionId.startsWith('group_');
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
        size: content.size || 0,
        format: content.format || ''
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
    sessionId: string
): ImTypes.WSMessage {
    const isGroup = sessionId.startsWith('group_');
    const type = isGroup ? ImTypes.MessageType.GROUP_IMAGE : ImTypes.MessageType.CHAT_IMAGE;
    const { baseMsg, wsMsg } = buildBase(type, sessionId, localMsg.clientId);

    wsMsg.payload = ImTypes.ImageMessage.encode({
        base: baseMsg,
        url: ossUrl,
        thumbnail_url: localMsg.thumbnailUrl || '',
        width: localMsg.width || 0,
        height: localMsg.height || 0,
        size: localMsg.size || 0,
        format: localMsg.format || ''
    }).finish();

    return wsMsg;
}

/**
 * 构建文件消息的 WS 包和占位本地消息
 * content.url 为空时表示占位消息（上传前），有值时表示结果消息（上传后）
 */
export function buildFileWsMessage(
    content: FileContent,
    sessionId: string,
    existingClientId?: string
): WsMessageResult<ILocalFileMessage> {
    const isGroup = sessionId.startsWith('group_');
    const type = isGroup ? ImTypes.MessageType.GROUP_FILE : ImTypes.MessageType.CHAT_FILE;
    const { clientId, baseMsg, wsMsg, commonFields } = buildBase(type, sessionId, existingClientId);

    wsMsg.payload = ImTypes.FileMessage.encode({
        base: baseMsg,
        url: content.url,
        file_name: content.fileName || '',
        size: content.size || 0,
        md5: ''
    }).finish();

    const localMsg: ILocalFileMessage = {
        ...commonFields,
        type,
        url: content.url,
        localPath: content.localPath,
        uploadProgress: content.uploadProgress,
        fileName: content.fileName || '',
        size: content.size || 0,
    };
    return { msg: wsMsg, clientId, localMsg };
}



export function buildVerifyWsMsg(type: ImTypes.MessageType, data:
    ImTypes.FriendRequest |
    ImTypes.GroupApply |
    ImTypes.Friend
    , targetId: number, targetType: ImTypes.TargetType): { msg: ImTypes.WSMessage, clientId?: string } {
    const wsMsg: ImTypes.WSMessage = {
        type,
        timestamp: Date.now(),
        version: config.wsMessageVersion,
        payload: new Uint8Array(),
        route_target: targetId,
        route_target_type: targetType,
    };

    let payload: Uint8Array = new Uint8Array();

    switch (type) {
        case ImTypes.MessageType.FRIEND_REQUEST:
            console.log(data)
            payload = ImTypes.FriendRequest.encode(data as ImTypes.FriendRequest).finish();
            console.log('finish')
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
 * 格式化系统消息内容
 */
export function formatSystemMessage(message: ILocalSystemMessage): string {
    const userStore = useUserStore();

    // 内部帮助函数：获取用户名
    const getUserName = (userId: number) => {
        if (!userId) return '';
        if (userId === userStore.userID) return '你';
        const friend = userStore.getFriend(userId);
        if (friend?.remark) return friend.remark;
        const user = userStore.getUser(userId);
        return user?.user_name || `用户${userId}`;
    };

    if (message.content) {
        return message.content;
    }

    const { opType, fromUserId, targetIds = [], reason, sessionId } = message;
    const operatorName = getUserName(fromUserId);
    const isSelf = fromUserId === userStore.userID;

    if (message.type === ImTypes.MessageType.MSG_RECALL) {
        if (sessionId && sessionId.startsWith('group_')) {
            return `${operatorName} 撤回了一条消息`;
        } else {
            return isSelf ? '你撤回了一条消息' : '对方撤回了一条消息';
        }
    }

    const firstTargetName = targetIds.length > 0 ? getUserName(targetIds[0]) : '';
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

