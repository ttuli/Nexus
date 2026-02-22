import { MessageType, MessageStatus, AtInfo, FileType } from './im';

/**
 * 基础消息结构 (本地扁平化)
 * 对应 proto 中的 BaseMessage，但为了方便使用，将其字段提升到顶级
 */
export interface ILocalMessageBase {
    // 基础字段 (来自 BaseMessage)
    msgId: string;           // 消息ID (int64 转 string)
    sessionId: string;       // 会话ID
    fromUserId: number;      // 发送者ID
    sendTime: number;        // 发送时间
    seq: number;             // 消息序号
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
    url: string;
    thumbnailUrl?: string;
    width: number;
    height: number;
    size: number;
    format: string;
}

/**
 * 视频消息
 */
export interface ILocalVideoMessage extends ILocalMessageBase {
    type: MessageType.CHAT_VIDEO | MessageType.GROUP_VIDEO;
    url: string;
    thumbnailUrl?: string;
    duration: number;
    width: number;
    height: number;
    size: number;
    format: string;
}

/**
 * 文件消息
 */
export interface ILocalFileMessage extends ILocalMessageBase {
    type: MessageType.CHAT_FILE | MessageType.GROUP_FILE;
    url: string;
    fileName: string;
    size: number;
    fileType: FileType;
}

/**
 * 联合类型：聊天消息
 */
export type IChatMessage =
    | ILocalTextMessage
    | ILocalImageMessage
    | ILocalVideoMessage
    | ILocalFileMessage;
// 未来可扩展其他类型

/**
 * 辅助函数：将 Proto 消息转为本地结构
 */
// (具体转换逻辑可以在 Service 中实现，这里只定义类型)
