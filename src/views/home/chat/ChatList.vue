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
import { messageService } from '@/services';

import notdisturb from '@/assets/chat/notdisturb.svg?raw';
import disturb from '@/assets/chat/disturb.svg?raw';
import nottop from '@/assets/chat/nottop.svg?raw';
import top from '@/assets/chat/top.svg?raw';
import trash from '@/assets/chat/trash.svg?raw';
import setmsgunread from '@/assets/chat/setmsgunread.svg?raw';
import setmsgread from '@/assets/chat/setmsgread.svg?raw';

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
        {
            label: chat.unread_count === 0 ? '设为未读' : '设为已读',
            key: chat.unread_count === 0 ? 'mark_unread' : 'mark_read',
            icon: chat.unread_count === 0 ? setmsgunread : setmsgread
        },
        {
            label: chat.is_top === 2 ? '取消置顶' : '置顶聊天',
            key: 'toggle_top',
            icon: chat.is_top === 2 ? nottop : top
        },
        {
            label: chat.is_disturb === 2 ? '取消免打扰' : '消息免打扰',
            key: 'toggle_disturb',
            icon: chat.is_disturb === 2 ? disturb : notdisturb
        },
        { label: '删除聊天', key: 'delete', icon: trash },
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
        case 'mark_unread':
            store.incrementUnread(chat.conversation_id);
            break;
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
            messageService.updateConversion(chat.conversation_id, 3 - chat.is_top, undefined);
            break;
        case 'toggle_disturb':
            messageService.updateConversion(chat.conversation_id, undefined, 3 - chat.is_disturb);
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
