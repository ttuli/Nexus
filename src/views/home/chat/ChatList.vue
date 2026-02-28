<template>
    <div class="chat-list">
        <div class="scroll-container scroll-bar-thin">
            <ChatCard v-for="chat in chatList" :key="chat.conversation_id" :data="chat"
                :isActive="currentSessionId === chat.conversation_id" @click="onChatClick" />
            <div v-if="chatList.length === 0" class="empty-state">
                <span>暂无聊天</span>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { onMounted, onActivated } from 'vue';

defineOptions({ name: 'ChatList' });
import { useRouter } from 'vue-router';
import { useChatStore } from '@/store/chat';
import ChatCard from './components/ChatCard.vue';

const router = useRouter();
const store = useChatStore();
const { chatList, currentSessionId } = storeToRefs(store);

const onChatClick = (sessionId: string) => {
    store.setCurrentChat(sessionId);
    router.push({ path: '/home/chat' });
};

const clearCurrentUnread = () => {
    if (currentSessionId.value) {
        store.clearUnread(currentSessionId.value);
    }
};

onMounted(() => {
    clearCurrentUnread();
});

onActivated(() => {
    clearCurrentUnread();
});
</script>

<style scoped lang="scss">
@use "@/style/_constant.scss" as *;

.chat-list {
    height: 100%;
    width: 100%;
    display: flex;
    flex-direction: column;
    background-color: $bg-list;
    overflow: hidden;

    .scroll-container {
        flex: 1;
        overflow-y: auto;
    }

    .empty-state {
        display: flex;
        justify-content: center;
        align-items: center;
        height: 200px;
        color: $color-text-placeholder;
        font-size: 14px;
    }
}
</style>
