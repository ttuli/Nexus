import { MessageType, MessageStatus, AtInfo, GroupOperationType } from './proto';

/**
 * 基础消息结构 (本地扁平化)
 * 对应 proto 中的 BaseMessage，但为了方便使用，将其字段提升到顶级
 */
export interface ILocalMessageBase {
    // 基础字段 (来自 BaseMessage)
    msgId: string;           // 消息ID (int64 转 string)
    sessionId: string;       // 会话ID
    sessionKey?: string;        // 前端会话 Key (用于标识没有 ID 的会话)
    fromUserId: number;      // 发送者ID
    sendTime: number;        // 发送时间
    seq: string;             // 消息序号 (Lamport, uint64 超出 JS 安全整数，以 string 承载)
    status: MessageStatus;   // 消息状态
    // 客户端/本地 额外字段
    clientId?: string;       // 客户端ID
    ext?: Record<string, string>; // 扩展字段 (Map<string, string>)

    // 本地特有状态
    isRead: boolean;         // 是否已读
}

/**
 * 文本消息
 */
export interface ILocalTextMessage extends ILocalMessageBase {
    type: MessageType.CHAT_TEXT | MessageType.GROUP_TEXT;
    content: string;
    atList?: AtInfo[];
}

/**
 * 图片消息
 */
export interface ILocalImageMessage extends ILocalMessageBase {
    type: MessageType.CHAT_IMAGE | MessageType.GROUP_IMAGE;
    url: string;            // OSS 网络地址（上传完成后填充）
    localPath?: string;     // 本地文件路径（发送时预览用）
    uploadProgress?: number; // 上传进度 0-100，上传完成后 undefined
    thumbnailUrl?: string;
    width: number;
    height: number;
    thumbnailWidth?: number;
    thumbnailHeight?: number;
    size: number;
    format: string;
    fileName?: string;
}

/**
 * 视频消息
 */
export interface ILocalVideoMessage extends ILocalMessageBase {
    type: MessageType.CHAT_VIDEO | MessageType.GROUP_VIDEO;
    url: string;
    localPath?: string;      // 本地文件路径（发送时预览用）
    uploadProgress?: number; // 上传进度 0-100，上传完成后 undefined
    thumbnailUrl?: string;
    duration: number;
    width: number;
    height: number;
    thumbnailWidth?: number;
    thumbnailHeight?: number;
    size: number;
    format: string;
    fileName: string;
}

/**
 * 音频消息
 */
export interface ILocalAudioMessage extends ILocalMessageBase {
    type: MessageType.CHAT_AUDIO | MessageType.GROUP_AUDIO;
    url: string;
    localPath?: string;      // 本地文件路径（发送时预览用）
    uploadProgress?: number; // 上传进度 0-100，上传完成后 undefined
    duration: number;
    size?: number;
    format?: string;
}

/**
 * 文件消息
 */
export interface ILocalFileMessage extends ILocalMessageBase {
    type: MessageType.CHAT_FILE | MessageType.GROUP_FILE;
    url: string;            // OSS 网络地址（上传完成后填充）
    localPath?: string;     // 本地文件路径（发送时预览用）
    uploadProgress?: number; // 上传进度 0-100，上传完成后 undefined
    fileName: string;
    size: number;
    format?: string;
}

/**
 * 系统消息 (用于群组通知、消息撤回等系统级提示)
 */
export interface ILocalSystemMessage extends ILocalMessageBase {
    type:
    | MessageType.MSG_OP_RECALL
    | MessageType.GROUP_OP_NOTIFICATION;

    // 可能包含直接显示的文本 (如撤回消息时的 "xxx撤回了一条消息")
    content?: string;

    // 群组操作相关字段
    opType?: GroupOperationType;
    groupId?: number;
    targetIds?: number[];
    reason?: string;
}

/**
 * 通话记录（CHAT_CALL）
 *
 * 由服务端在通话终态铸造，一通电话只有一条，客户端不产生本地乐观副本。
 * `fromUserId` 恒为**主叫**，客户端据此判断展示视角（我方「已取消」/ 对方「未接来电」）。
 */
export interface ILocalCallMessage extends ILocalMessageBase {
    type: MessageType.CHAT_CALL;
    callId: string;
    /** call.CallMediaType：0=语音 1=视频 */
    mediaType: number;
    /** call.CallEndReason */
    endReason: number;
    /** 通话秒数，仅 COMPLETED 有意义 */
    duration: number;
}

/**
 * 联合类型：聊天消息
 */
export type IChatMessage =
    | ILocalTextMessage
    | ILocalImageMessage
    | ILocalVideoMessage
    | ILocalAudioMessage
    | ILocalFileMessage
    | ILocalCallMessage
    | ILocalSystemMessage;
// 未来可扩展其他类型

/**
 * 辅助函数：将 Proto 消息转为本地结构
 */
// (具体转换逻辑可以在 Service 中实现，这里只定义类型)
