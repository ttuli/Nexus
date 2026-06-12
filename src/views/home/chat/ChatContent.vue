<template>
    <div class="chat-content" v-if="currentChat" @click="closeSidebar">
        <!-- Header -->
        <div class="header">
            <span class="title">{{ title }}</span>
            <div class="actions">
                <span v-if="currentChat.type === ImTypes.ConversationType.CONVERSATION_TYPE_PRIVATE" v-html="phoneIcon"
                    class="icon-btn phone" title="语音通话" @click="startCall">
                </span>
                <div class="icon-btn" title="聊天信息" @click="toggleSidebar">⋮</div>
            </div>
        </div>

        <!-- Warning Area -->
        <div class="chat-warning" v-if="chatDisableReason">
            <span>{{ chatDisableReason }}</span>
        </div>

        <!-- Content Area (Relative for Sidebar) -->
        <div class="content-wrapper">
            <!-- Message List -->
            <div class="message-area scroll-bar-thin" ref="messageListRef">
                <van-list v-model:loading="isLoading" :finished="!hasMore" finished-text="" direction="up"
                    @load="onLoad">
                    <template v-if="messages.length > 0">
                        <transition-group name="msg-fade" appear>
                            <template v-for="msg in messages" :key="msg.clientId || msg.msgId">
                                <!-- 系统 / 群通知消息气泡 -->
                                <SystemMessageBubble v-if="isSystemMessage(msg.type)" :message="(msg as any)" />
                                <!-- 普通用户聊天气泡 -->
                                <MessageBubble v-else :message="msg" :is-self="isSelf(msg.fromUserId)"
                                    @contextmenu="handleMessageContextMenu"
                                    :class="{ 'is-self': isSelf(msg.fromUserId) }" />
                            </template>
                        </transition-group>
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

            <AiSuggestions :visible="aiSuggestionsVisible" @select="handleSelectSuggestion"
                @close="aiSuggestionsVisible = false" />

            <!-- Input Area -->
            <div class="input-area" :style="{ height: inputHeight + 'px' }">
                <ChatInput ref="chatInputRef" :disable-reason="chatDisableReason" @send="handleSendMessage"
                    @sendImage="handleSendImage" @sendFile="handleSendFile" @triggerAi="handleTriggerAi" />
            </div>
        </div>
    </div>
    <BlankPage v-else />
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { useChatStore } from '@/src/store/chat';
import { useUserStore } from '@/src/store/user';
import { useGroupStore } from '@/src/store/group';
import { storeToRefs } from 'pinia';
import { extractTargetIdFromSessionId } from '@/src/utils/chat';
import MessageBubble from '@/src/views/home/chat/components/Bubble/MessageBubble.vue';
import SystemMessageBubble from '@/src/views/home/chat/components/Bubble/SystemMessageBubble.vue';
import { IChatMessage, ILocalTextMessage } from '@/src/types/chatMessage';
import { ImTypes } from '@/src/types';
import ChatInput from './components/ChatInput.vue';
import ChatSidebar from './components/sidebar/index.vue';
import AiSuggestions from './components/AiSuggestions.vue';
import type { MenuOption } from '@/src/components/ContextMenu.vue';
import { ElMessage } from 'element-plus';

import copyIcon from '@/src/assets/chat/copy.svg?raw';
import phoneIcon from '@/src/assets/call/phone.svg?raw';
import trashIcon from '@/src/assets/chat/trash.svg?raw'
import { websocketService, windowService } from '@/src/services';


const chatStore = useChatStore();
const userStore = useUserStore();
const groupStore = useGroupStore();
const { currentChat, currentSessionId, messages, isLoading, hasMore } = storeToRefs(chatStore);

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

const isSystemMessage = (type: number) => {
    const sysTypes = [
        MessageType.MSG_RECALL,
        MessageType.GROUP_OP_NOTIFICATION,
        MessageType.NOTIFICATION
    ];
    return sysTypes.includes(type);
};

const menuOptions = ref<MenuOption[]>([]);

const handleMessageContextMenu = (event: MouseEvent, message: IChatMessage) => {
    if (isSystemMessage(message.type)) return;

    let options: MenuOption[] = [];

    if (message.type === MessageType.CHAT_TEXT || message.type === MessageType.GROUP_TEXT) {
        options = [
            { label: '复制', key: 'copy', icon: copyIcon }
        ];
    }

    // 后续可以根据需要的消息类型（如图片等）添加其他菜单
    options.push({ label: '删除', key: 'remove', icon: trashIcon });
    if (options.length === 0) return;

    menuOptions.value = options;
    menuX.value = event.clientX;
    menuY.value = event.clientY;
    contextMenuTarget.value = message;
    menuVisible.value = true;
};

const handleMenuSelect = async (option: MenuOption) => {
    if (!contextMenuTarget.value) return;
    if (option.key === 'copy') {
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

const title = computed(() => {
    if (!currentChat.value) return '';
    const targetId = extractTargetIdFromSessionId(currentChat.value.conversation_id, userStore.getUserID());
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

const chatDisableReason = computed(() => {
    if (!currentChat.value) return '';
    const targetId = extractTargetIdFromSessionId(currentChat.value.conversation_id, userStore.getUserID());
    if (!targetId) return '';

    if (currentChat.value.type === ImTypes.ConversationType.CONVERSATION_TYPE_PRIVATE) {
        if (!userStore.isFriend(targetId)) {
            return '您与对方非好友关系，无法发送消息';
        }
    } else {
        if (!groupStore.isJoinedGroup(targetId)) {
            return '您已不在此群聊中，无法发送消息';
        }
    }
    return '';
});

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
watch(messages, () => {
    scrollToBottom();
}, { deep: true });

// Watch chat change to scroll bottom
watch(currentSessionId, () => {
    if (currentSessionId.value) {
        sidebarVisible.value = false;
    }
});

const handleSendMessage = async (content: string) => {
    await websocketService.sendText(content);
};

const handleSendImage = async (file: File) => {
    try {
        await websocketService.sendImage(file);
    } catch {
        ElMessage.error('上传图片失败');
    }
};

const handleSendFile = async (file: File) => {
    try {
        if (file.type.startsWith('video/')) {
            await websocketService.sendVideo(file);
        } else {
            await websocketService.sendFile(file);
        }
    } catch {
        ElMessage.error(file.type.startsWith('video/') ? '上传视频失败' : '上传文件失败');
    }
};

const chatInputRef = ref<InstanceType<typeof ChatInput> | null>(null);

const aiSuggestionsVisible = ref(false);

const handleTriggerAi = () => {
    aiSuggestionsVisible.value = !aiSuggestionsVisible.value;
};

const handleSelectSuggestion = (text: string) => {
    if (chatInputRef.value) {
        chatInputRef.value.insertText(text);
    }
    aiSuggestionsVisible.value = false;
};

const startCall = () => {
    if (!currentChat.value) return;
    const targetId = extractTargetIdFromSessionId(currentChat.value.conversation_id, userStore.getUserID());
    const targetType = currentChat.value.type === ImTypes.ConversationType.CONVERSATION_TYPE_PRIVATE ? 'private' : 'group';

    if (targetId) {
        windowService.createWindow('call', {
            targetId: targetId,
            fromId: userStore.getUserID(),
            targetType
        });
    }
}

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
@use "@/src/style/_constant.scss" as *;

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
            display: flex;

            .phone {
                padding: 6px;
                box-sizing: border-box;
            }

            .ai {
                padding: 6px;
                box-sizing: border-box;
            }

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

    .chat-warning {
        -webkit-app-region: no-drag;
        background-color: rgba(253, 230, 232, 0.9);
        color: $color-error;
        padding: 8px 20px;
        font-size: 13px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        z-index: 5;
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

            /* 消息入场/离场动画 */
            .msg-fade-enter-active,
            .msg-fade-leave-active {
                transition: all 0.3s ease-out;
            }

            /* 默认状态 (左侧消息：别人发来的) */
            .msg-fade-enter-from,
            .msg-fade-leave-to {
                opacity: 0;
                transform: translateX(-20px);
            }

            /* 自己的消息状态 (右侧消息) */
            .msg-fade-enter-from.is-self,
            .msg-fade-leave-to.is-self {
                opacity: 0;
                transform: translateX(20px);
            }

            .msg-fade-leave-active {
                position: absolute;
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
