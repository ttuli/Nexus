<template>
    <div class="chat-list">
        <div class="scroll-container scroll-bar-thin">
            <ChatCard v-for="chat in chatList" :key="chat.conversation_id" :data="chat"
                :isActive="currentSessionId === chat.conversation_id" @click="onChatClick"
                @contextmenu.prevent="handleContextMenu($event, chat)" />
            <ContextMenu v-model:visible="menuVisible" :x="menuX" :y="menuY" :options="menuOptions"
                @select="handleMenuSelect" />
            <div v-if="chatList.length === 0" class="empty-state">
                <span>暂无聊天</span>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { onMounted, onActivated, ref, computed } from 'vue';

defineOptions({ name: 'ChatList' });
import { useRouter } from 'vue-router';
import { useChatStore } from '@/store/chat';
import ChatCard from './components/ChatCard.vue';
import ContextMenu, { type MenuOption } from '@/components/ContextMenu.vue';
import { ImTypes } from '@/types';

const router = useRouter();
const store = useChatStore();
const { chatList, currentSessionId } = storeToRefs(store);

const onChatClick = (sessionId: string) => {
    store.setCurrentChat(sessionId);
    router.push({ path: '/home/chat' });
};

const menuVisible = ref(false);
const menuX = ref(0);
const menuY = ref(0);
const contextMenuTarget = ref<ImTypes.Conversation | null>(null);

const menuOptions = computed<MenuOption[]>(() => {
    const chat = contextMenuTarget.value;
    if (!chat) return [];
    return [
        { label: '设为已读', key: 'mark_read' },
        { label: chat.is_top ? '取消置顶' : '置顶聊天', key: 'toggle_top' },
        { label: '删除聊天', key: 'delete' },
        { label: chat.is_disturb ? '取消免打扰' : '消息免打扰', key: 'toggle_disturb' }
    ];
});

const handleContextMenu = (event: MouseEvent, chat: ImTypes.Conversation) => {
    menuX.value = event.clientX;
    menuY.value = event.clientY;
    contextMenuTarget.value = chat;
    menuVisible.value = true;
};

const handleMenuSelect = (option: MenuOption) => {
    const chat = contextMenuTarget.value;
    if (!chat) return;

    switch (option.key) {
        case 'mark_read':
            store.clearUnread(chat.conversation_id);
            break;
        case 'delete':
            store.removeChat(chat.conversation_id);
            if (currentSessionId.value === chat.conversation_id) {
                // 如果删除的是当前会话，需要清空当前会话
                store.currentSessionId = '';
                store.currentChatId = null;
                store.resetMessageState();
            }
            break;
        case 'toggle_top':
            // 待实现
            break;
        case 'toggle_disturb':
            // 待实现
            break;
    }
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
