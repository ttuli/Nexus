<template>
    <div class="chat-content" v-if="currentChat" @click="closeSidebar">
        <!-- Header -->
        <div class="header">
            <span class="title">{{ title }}</span>
            <div class="actions">
                <div class="icon-btn" @click="toggleSidebar">⋮</div>
            </div>
        </div>

        <!-- Content Area (Relative for Sidebar) -->
        <div class="content-wrapper">
            <!-- Message List -->
            <div class="message-area scroll-bar-thin" ref="messageListRef">
                <van-list v-model:loading="isLoading" :finished="!hasMore" finished-text="" direction="up"
                    @load="onLoad">
                    <template v-if="messages.length > 0">
                        <MessageBubble v-for="msg in messages" :key="msg.msgId" :message="msg"
                            :is-self="isSelf(msg.fromUserId)" @contextmenu="handleMessageContextMenu" />
                    </template>
                    <div v-else class="empty-messages">
                        开始聊天吧~
                    </div>
                </van-list>
            </div>

            <!-- Chat Sidebar -->
            <ChatSidebar :visible="sidebarVisible" :chat="currentChat" @close="sidebarVisible = false" @click.stop />

            <ContextMenu v-model:visible="menuVisible" :x="menuX" :y="menuY" :options="menuOptions"
                @select="handleMenuSelect" />

            <!-- Resize Handle -->
            <div class="resize-handle" @mousedown="startResize"></div>

            <!-- Input Area -->
            <div class="input-area" :style="{ height: inputHeight + 'px' }">
                <ChatInput @send="handleSendMessage" />
            </div>
        </div>
    </div>
    <BlankPage v-else />
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { useChatStore } from '@/store/chat';
import { useUserStore } from '@/store/user';
import { useGroupStore } from '@/store/group';
import { storeToRefs } from 'pinia';
import MessageBubble from './components/MessageBubble.vue';
import { IChatMessage, ILocalTextMessage } from '@/types/chatMessage';
import { ImTypes } from '@/types';
import ChatInput from './components/ChatInput.vue';
import ChatSidebar from './components/ChatSidebar.vue';
import type { MenuOption } from '@/components/ContextMenu.vue';
import { ElMessage } from 'element-plus';

import copyIcon from '@/assets/chat/copy.svg?url';
import { buildWsMessage } from '@/utils/chat';
import { websocketService } from '@/services';


const chatStore = useChatStore();
const userStore = useUserStore();
const groupStore = useGroupStore();
const { currentChatType, currentSessionId, messages, isLoading, hasMore } = storeToRefs(chatStore);

// Sidebar Logic
const sidebarVisible = ref(false);
const toggleSidebar = (event: MouseEvent) => {
    event.stopPropagation(); // Prevent immediate closing
    sidebarVisible.value = !sidebarVisible.value;
};

// Close sidebar when clicking outside
const closeSidebar = () => {
    if (sidebarVisible.value) {
        sidebarVisible.value = false;
    }
};

// Context Menu Logic
const menuVisible = ref(false);
const menuX = ref(0);
const menuY = ref(0);
const contextMenuTarget = ref<IChatMessage | null>(null);
const MessageType = ImTypes.MessageType;

const menuOptions: MenuOption[] = [
    { label: '复制', key: 'copy', icon: copyIcon }
];

const handleMessageContextMenu = (event: MouseEvent, message: IChatMessage) => {
    menuX.value = event.clientX;
    menuY.value = event.clientY;
    contextMenuTarget.value = message;
    menuVisible.value = true;
};

const handleMenuSelect = async (option: MenuOption) => {
    if (option.key === 'copy' && contextMenuTarget.value) {
        let content = '';
        if (contextMenuTarget.value.type === MessageType.CHAT_TEXT || contextMenuTarget.value.type === MessageType.GROUP_TEXT) {
            content = (contextMenuTarget.value as ILocalTextMessage).content;
        }

        if (content) {
            try {
                await navigator.clipboard.writeText(content);
                ElMessage.success('复制成功');
            } catch (err) {
                ElMessage.error('复制失败');
                console.error('Failed to copy', err);
            }
        }
    }
};



// Computed
const currentChat = computed(() => chatStore.currentChat);

const title = computed(() => {
    if (!currentChat.value) return '';
    const targetId = currentChat.value.target_id;
    // targetId could be null/undefined in IConversation, but in practice for a valid chat it should be number.
    // If it's undefined, we fallback to 0 or check if it exists.
    if (!targetId) return '';

    if (currentChat.value.type === ImTypes.ConversationType.CONVERSATION_TYPE_PRIVATE) {
        const friend = userStore.getFriend(targetId);
        const user = userStore.getUser(targetId);
        return friend?.remark || user?.user_name || `用户${targetId}`;
    } else {
        const group = groupStore.getGroup(targetId);
        return group?.name || `群组${targetId}`;
    }
});

const isSelf = (uid: number) => uid === userStore.userID;

// Messages (Local Mock)
// Messages handled by store now
const messageListRef = ref<HTMLElement | null>(null);

const scrollToBottom = () => {
    nextTick(() => {
        if (messageListRef.value) {
            messageListRef.value.scrollTop = messageListRef.value.scrollHeight;
        }
    });
};

const onLoad = () => {
    chatStore.loadMoreMessages();
};

// Auto scroll on first load or send
watch(() => messages.value.length, (newLen, oldLen) => {
    if (oldLen === 0 && newLen > 0) {
        scrollToBottom();
    }
});

// Watch chat change to scroll bottom
watch(currentSessionId, () => {
    if (currentSessionId.value) {
        sidebarVisible.value = false;
        // Store handles fetching, we just ensure scroll?
        // Actually Vant List handle loading.
        // We might want to scroll to bottom initially?
        // Let's modify store to set "initial load" flag or just observe messages length change from 0 to N.
    }
});

const handleSendMessage = async (content: string) => {
    const { msg, clientId, localMsg } = buildWsMessage(currentChatType.value === ImTypes.ConversationType.CONVERSATION_TYPE_GROUP ?
        ImTypes.MessageType.GROUP_TEXT : ImTypes.MessageType.CHAT_TEXT,
        content);

    // Optimistically add to list
    chatStore.addMessage(localMsg);

    const result = await websocketService.send(msg, clientId);
    if (!result.success || !result.data.sent) {
        // Update status to FAILED after a short delay
        setTimeout(() => {
            chatStore.updateMessageStatus(chatStore.currentSessionId, clientId, ImTypes.MessageStatus.MESSAGE_STATUS_FAILED);
        }, 1000);
        return;
    }
    scrollToBottom();
};

// Resizer Logic
const inputHeight = ref(200);
const startResize = (e: MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = inputHeight.value;

    const onMouseMove = (moveEvent: MouseEvent) => {
        const delta = startY - moveEvent.clientY;
        const newHeight = Math.max(160, Math.min(450, startHeight + delta));
        inputHeight.value = newHeight;
    };

    const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
};
</script>

<style scoped lang="scss">
@use "@/style/_constant.scss" as *;

.chat-content {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    background-color: $bg-body;
    position: relative;
    overflow: hidden; // Ensure sidebar doesn't overflow container

    .header {
        height: 30px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 20px;
        padding-top: 35px;
        padding-right: 0;
        background: rgba(255, 255, 255, 0.8);
        backdrop-filter: blur(10px);
        border-bottom: 1px solid #ececec;

        .title {
            font-size: 18px;
            font-weight: 600;
            color: $color-text-primary;
            @include ellipsis;
            margin-bottom: 5px;
        }

        .actions {
            -webkit-app-region: no-drag;

            .icon-btn {
                width: 32px;
                height: 32px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 4px;
                cursor: pointer;
                color: $color-text-secondary;
                transition: background-color 0.2s;

                &:hover {
                    background-color: $bg-hover;
                }
            }
        }
    }

    .content-wrapper {
        flex: 1;
        display: flex;
        flex-direction: column;
        position: relative;
        overflow: hidden;
        height: 100%;
        // background-color: $bg-body;

        .message-area {
            -webkit-app-region: no-drag;
            flex: 1;
            overflow-y: auto;
            padding: 20px 20px 0;
            background-color: #f7f7f7; // Light gray bg for chat area

            .empty-messages {
                height: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
                color: $color-text-placeholder;
                font-size: 14px;
            }
        }

        .resize-handle {
            -webkit-app-region: no-drag;
            height: 4px;
            cursor: ns-resize;
            background-color: transparent;
            transition: background-color 0.2s;
            z-index: 10; // Ensure handle is above input

            &:hover {
                background-color: rgba($color-primary, 0.2);
            }
        }

        .input-area {
            -webkit-app-region: no-drag;
            border-top: 1px solid $color-border;
            background-color: white;
            flex-shrink: 0;
        }
    }
}

.empty-state {
    height: 100%;
    width: 100%;
}
</style>
