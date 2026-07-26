<template>
    <div class="chat-list">
        <div class="scroll-container scroll-bar-thin">
            <SessionCard v-for="chat in sessionList" :key="chat.session_id || chat.session_key" :data="chat"
                 :isActive="currentSessionKey === chat.session_key" @click="navigateToChat(chat.session_key)"
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
import { useSessionStore } from '@/src/store/session';
import { useMessageStore } from '@/src/store/message';
import { useChatNavigation } from '@/src/composables/useChatNavigation';
import { reportSessionRead, updateSessionOptions } from '@/src/composables/sessionActions';
import SessionCard from './components/SessionCard.vue';
import type { MenuOption } from '@/src/components/ContextMenu.vue';
import { ImTypes } from '@shared/types';

import { sessionService } from '@/src/services/sessionService';

import { Notification, BellOff, Pin, PinOff, Trash, CheckRead, Sms } from 'reicon-vue';

const sessionStore = useSessionStore();
const messageStore = useMessageStore();

const { sessionList, currentSessionKey } = storeToRefs(sessionStore);
const { navigateToChat } = useChatNavigation();

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
            icon: chat.unread_count === 0 ? Sms : CheckRead
        },
        {
            label: chat.is_top === 2 ? '取消置顶' : '置顶聊天',
            key: 'toggle_top',
            icon: chat.is_top === 2 ? PinOff : Pin
        },
        {
            label: chat.is_disturb === 2 ? '取消免打扰' : '消息免打扰',
            key: 'toggle_disturb',
            icon: chat.is_disturb === 2 ? Notification : BellOff
        },
        { label: '删除聊天', key: 'delete', icon: Trash },
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
            sessionStore.incrementUnread(chat.session_key);
            break;
        case 'mark_read':
            sessionStore.clearUnread(chat.session_key);
            reportSessionRead(chat.session_key);
            break;
        case 'delete':
            sessionStore.removeSession(chat.session_key);
            void sessionService.deleteOne(chat.session_key);
            if (currentSessionKey.value === chat.session_key) {
                // 如果删除的是当前会话，需要清空当前会话
                sessionStore.setCurrentSession('');
                messageStore.resetMessageState();
            }
            break;
        case 'toggle_top':
            void updateSessionOptions(chat.session_key, 3 - chat.is_top, undefined);
            break;
        case 'toggle_disturb':
            void updateSessionOptions(chat.session_key, undefined, 3 - chat.is_disturb);
            break;
    }
};

const clearCurrentUnread = () => {
    if (currentSessionKey.value) {
        sessionStore.clearUnread(currentSessionKey.value);
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
