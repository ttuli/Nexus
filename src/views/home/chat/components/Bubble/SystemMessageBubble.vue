<template>
    <div class="system-message-bubble">
        <span class="content">{{ systemMessageText }}</span>
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { ILocalSystemMessage } from '@shared/types/chatMessage';
import { useUserStore } from '@/src/store/user';
import { userService } from '@/src/services';
import { formatSystemMessage } from '@/src/utils/messageConverter';

interface Props {
    message: ILocalSystemMessage;
}

const props = defineProps<Props>();
const userStore = useUserStore();

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
    const getUserName = (userId: number) => {
        const friend = userStore.getFriend(userId);
        if (friend?.remark) return friend.remark;
        const user = userStore.getUser(userId);
        return user?.user_name || '';
    };
    return formatSystemMessage(props.message, userStore.userID, getUserName);
});
</script>

<style scoped lang="scss">
@use "@/src/style/_constant.scss" as *;

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
