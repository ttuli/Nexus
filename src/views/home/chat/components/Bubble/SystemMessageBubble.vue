<template>
    <div class="system-message-bubble">
        <span class="content">{{ systemMessageText }}</span>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ILocalGroupNotificationMessage } from '@/types/chatMessage';
import { ImTypes } from '@/types';
import { useUserStore } from '@/store/user';

interface Props {
    message: ILocalGroupNotificationMessage;
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

const systemMessageText = computed(() => {
    const { opType, fromUserId, targetIds = [], reason } = props.message;
    const operatorName = getUserName(fromUserId);
    
    // We try to name the first target if available
    const firstTargetName = targetIds.length > 0 ? getUserName(targetIds[0]) : '';
    const multipleTargetsSuffix = targetIds.length > 1 ? `等 ${targetIds.length} 人` : '';
    const targetsDesc = `${firstTargetName}${multipleTargetsSuffix}`;

    switch (opType) {
        case ImTypes.GroupOperationType.GROUP_OP_CREATE:
            return `${operatorName} 创建了群组`;
        case ImTypes.GroupOperationType.GROUP_OP_DISMISS:
            return `${operatorName} 解散了群组`;
        case ImTypes.GroupOperationType.GROUP_OP_JOIN:
            return `${operatorName} 加入了群组`;
        case ImTypes.GroupOperationType.GROUP_OP_LEAVE:
            return `${operatorName} 退出了群组`;
        case ImTypes.GroupOperationType.GROUP_OP_KICK:
            return `${targetsDesc} 被 ${operatorName} 移出群组${reason ? ' (' + reason + ')' : ''}`;
        case ImTypes.GroupOperationType.GROUP_OP_INVITE:
            return `${operatorName} 邀请 ${targetsDesc} 加入群组`;
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
