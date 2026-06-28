/**
 * 系统消息工具
 * 负责格式化系统通知文本和生成会话列表预览文字
 */

import { ImTypes, IChatMessage, ILocalSystemMessage } from '@/src/types';
import { useUserStore } from '@/src/store/user';

/**
 * 格式化系统消息内容，返回可读的中文描述
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

    const { opType, fromUserId, targetIds = [], reason } = message;
    const operatorName = getUserName(fromUserId);
    const isSelf = fromUserId === userStore.userID;

    if (message.type === ImTypes.MessageType.MSG_RECALL) {
        if (message.targetIds?.length && message.targetIds[0] === message.groupId) {
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

/**
 * 根据消息类型生成会话列表中展示的最后一条消息预览文字
 * @param message 本地消息对象
 * @returns 预览字符串，如 '[图片]'、'[文件]' 或文本内容
 */
export function getLastContent(message: IChatMessage): string {
    switch (message.type) {
        case ImTypes.MessageType.CHAT_TEXT:
        case ImTypes.MessageType.GROUP_TEXT:
            return (message as any).content ?? '';
        case ImTypes.MessageType.CHAT_IMAGE:
        case ImTypes.MessageType.GROUP_IMAGE:
            return '[图片]';
        case ImTypes.MessageType.CHAT_FILE:
        case ImTypes.MessageType.GROUP_FILE:
            return '[文件]';
        case ImTypes.MessageType.CHAT_VIDEO:
        case ImTypes.MessageType.GROUP_VIDEO:
            return '[视频]';
        case ImTypes.MessageType.CHAT_AUDIO:
        case ImTypes.MessageType.GROUP_AUDIO:
            return '[音频]';
        case ImTypes.MessageType.GROUP_OP_NOTIFICATION:
        case ImTypes.MessageType.MSG_RECALL:
            return formatSystemMessage(message as ILocalSystemMessage);
        default:
            return '[消息]';
    }
}
