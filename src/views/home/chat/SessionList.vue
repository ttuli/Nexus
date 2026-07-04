<template>
    <div class="chat-list">
        <div class="scroll-container scroll-bar-thin">
            <SessionCard v-for="chat in sessionList" :key="chat.session_id || chat.session_key" :data="chat"
                 :isActive="currentSessionKey === chat.session_key" @click="onChatClick"
                 @contextmenu.prevent="handleContextMenu($event, chat)" />
            <ContextMenu v-model:visible="menuVisible" :x="menuX" :y="menuY" :options="menuOptions"
                 @select="handleMenuSelect" />
            <div v-if="sessionList.length === 0" class="empty-state">
                 <span>暂无聊天</span>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { onMounted, onActivated, ref, computed } from 'vue';

defineOptions({ name: 'SessionList' });
import { useRouter } from 'vue-router';
import { useSessionStore } from '@/src/store/session';
import { useMessageStore } from '@/src/store/message';
import { useChatNavigation } from '@/src/composables/useChatNavigation';
import SessionCard from './components/SessionCard.vue';
import ContextMenu, { type MenuOption } from '@/src/components/ContextMenu.vue';
import { ImTypes } from '@/src/types';
import { messageService } from '@/src/services';

import notdisturb from '@/src/assets/chat/notdisturb.svg?raw';
import disturb from '@/src/assets/chat/disturb.svg?raw';
import nottop from '@/src/assets/chat/nottop.svg?raw';
import top from '@/src/assets/chat/top.svg?raw';
import trash from '@/src/assets/chat/trash.svg?raw';
import setmsgunread from '@/src/assets/chat/setmsgunread.svg?raw';
import setmsgread from '@/src/assets/chat/setmsgread.svg?raw';

const router = useRouter();
const conversationStore = useSessionStore();
const messageStore = useMessageStore();
const { sessionList, currentSessionKey } = storeToRefs(conversationStore);
const { navigateToChat } = useChatNavigation();

const onChatClick = (sessionId: string) => {
    navigateToChat(sessionId);
    router.push({ path: '/home/chat' });
};

const menuVisible = ref(false);
const menuX = ref(0);
const menuY = ref(0);
const contextMenuTarget = ref<ImTypes.Session | null>(null);

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

const handleContextMenu = (event: MouseEvent, chat: ImTypes.Session) => {
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
            conversationStore.incrementUnread(chat.session_key);
            break;
        case 'mark_read':
            conversationStore.clearUnread(chat.session_key);
            break;
        case 'delete':
            conversationStore.removeSession(chat.session_key);
            if (currentSessionKey.value === chat.session_key) {
                // 如果删除的是当前会话，需要清空当前会话
                conversationStore.setCurrentSession('');
                messageStore.resetMessageState();
            }
            break;
        case 'toggle_top':
            messageService.updateConversion(chat.session_id, 3 - chat.is_top, undefined);
            break;
        case 'toggle_disturb':
            messageService.updateConversion(chat.session_id, undefined, 3 - chat.is_disturb);
            break;
    }
};

const clearCurrentUnread = () => {
    if (currentSessionKey.value) {
        conversationStore.clearUnread(currentSessionKey.value);
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
@use "@/src/style/_constant.scss" as *;

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
