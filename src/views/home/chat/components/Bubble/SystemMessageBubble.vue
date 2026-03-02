<template>
    <div class="system-message-bubble">
        <span class="content">{{ systemMessageText }}</span>
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { ILocalSystemMessage } from '@/types/chatMessage';
import { ImTypes } from '@/types';
import { useUserStore } from '@/store/user';
import { userService } from '@/services';

interface Props {
    message: ILocalSystemMessage;
}

const props = defineProps<Props>();
const userStore = useUserStore();

// A generic helper to get username by ID. In a real app this might be loaded async or from a map.
const getUserName = (userId: number) => {
    if (userId === userStore.userID) return '你';
    const friend = userStore.getFriend(userId);
    if (friend?.remark) return friend.remark;
    const user = userStore.getUser(userId);
    return user?.user_name || `用户${userId}`;
};

onMounted(async () => {
    const { fromUserId, targetIds = [] } = props.message;
    const idsToFetch: number[] = [];
    
    if (fromUserId && fromUserId !== userStore.userID && !userStore.getUser(fromUserId)) {
        idsToFetch.push(fromUserId);
    }
    
    for (const id of targetIds) {
        if (id && id !== userStore.userID && !userStore.getUser(id)) {
            idsToFetch.push(id);
        }
    }

    const uniqueIds = Array.from(new Set(idsToFetch));
    if (uniqueIds.length > 0) {
        try {
            await userService.fetchByIds(uniqueIds);
        } catch (error) {
            console.error('Failed to fetch user info for system message bubble:', error);
        }
    }
});

const systemMessageText = computed(() => {
    if (props.message.content) {
        return props.message.content;
    }

    const { opType, fromUserId, targetIds = [], reason, sessionId } = props.message;
    const operatorName = getUserName(fromUserId);
    const isSelf = fromUserId === userStore.userID;
    
    if (props.message.type === ImTypes.MessageType.MSG_RECALL) {
        // 群聊
        if (sessionId && sessionId.startsWith('group_')) {
            return `${operatorName} 撤回了一条消息`;
        } else {
            // 私聊
            return isSelf ? '你撤回了一条消息' : '对方撤回了一条消息';
        }
    }

    // We try to name the first target if available
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
});
</script>

<style scoped lang="scss">
@use "@/style/_constant.scss" as *;

.system-message-bubble {
    display: flex;
    justify-content: center;
    margin: 16px 0;
    width: 100%;
    
    .content {
        display: inline-block;
        padding: 4px 12px;
        background-color: rgba(0, 0, 0, 0.06);
        color: $color-text-secondary;
        font-size: 12px;
        border-radius: 12px;
        line-height: 1.5;
        text-align: center;
        max-width: 80%;
        word-break: break-all;
    }
}
</style>
