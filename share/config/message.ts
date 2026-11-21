import type { HistoryMessageCategory } from '@shared/types/chatMessage';
import { MessageType } from '@shared/types/proto';

/** 历史消息窗口的类型筛选映射（单聊 + 群聊） */
export const HISTORY_CATEGORY_TYPES: Record<HistoryMessageCategory, readonly MessageType[]> = {
    text: [MessageType.CHAT_TEXT, MessageType.GROUP_TEXT],
    audio: [MessageType.CHAT_AUDIO, MessageType.GROUP_AUDIO],
    image: [MessageType.CHAT_IMAGE, MessageType.GROUP_IMAGE],
    file: [MessageType.CHAT_FILE, MessageType.GROUP_FILE],
    video: [MessageType.CHAT_VIDEO, MessageType.GROUP_VIDEO],
};

/** 历史消息检索过滤配置 */
export const MESSAGE_FILTER_CONFIG = {
    historyCategoryTypes: HISTORY_CATEGORY_TYPES,
    /** 关键词匹配正文字段（$.content）的消息类型 */
    keywordContentTypes: HISTORY_CATEGORY_TYPES.text,
    /** 关键词匹配文件名字段（$.fileName）的消息类型 */
    keywordFileNameTypes: [
        ...HISTORY_CATEGORY_TYPES.file,
        ...HISTORY_CATEGORY_TYPES.image,
        ...HISTORY_CATEGORY_TYPES.video,
    ] as readonly MessageType[],
    /** 通知类消息（撤回通知、群操作通知），与服务端未读计数及会话预览口径一致 */
    notificationTypes: [
        MessageType.MSG_OP_RECALL,
        MessageType.GROUP_OP_NOTIFICATION,
    ] as readonly MessageType[],
} as const;
