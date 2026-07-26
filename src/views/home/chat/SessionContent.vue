<template>
    <div class="chat-content" v-if="currentSession" @click="closeSidebar">
        <!-- Header -->
        <div class="header">
            <span class="title">{{ title }}</span>
            <div class="actions">
                <div v-if="currentSession.type === ImTypes.SessionType.SESSION_TYPE_PRIVATE"
                    class="icon-btn" title="语音通话" @click="startCall">
                    <CallCalling class="app-icon app-icon--sm" />
                </div>
                <div class="icon-btn" :class="{ disabled: !canOpenSidebar }" title="聊天信息" @click="toggleSidebar">⋮</div>
            </div>
        </div>

        <!-- Content Area (Relative for Sidebar) -->
        <div class="content-wrapper">
            <!-- Message List -->
            <div class="message-area scroll-bar-thin" ref="messageListRef" @scroll="handleScroll">
                <div v-if="messages.length > 0" :style="{ height: `${virtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }">
                    <div
                        v-for="virtualRow in virtualizer.getVirtualItems()"
                        :key="String(virtualRow.key)"
                        :ref="el => { if (el) virtualizer.measureElement(el as Element) }"
                        :data-index="virtualRow.index"
                        class="virtual-item"
                        :class="getMessageClass(messages[virtualRow.index])"
                        :style="{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            transform: `translateY(${virtualRow.start}px)`
                        }"
                    >
                        <!-- 动画包裹层：进场动画的 transform 必须与外层虚拟定位的 translateY 隔离 -->
                        <div class="bubble-anim">
                            <!-- 系统 / 群通知 / 已撤回消息气泡 -->
                            <SystemMessageBubble v-if="isSystemOrRecalled(messages[virtualRow.index])" :message="(messages[virtualRow.index] as any)" />
                            <!-- 普通用户聊天气泡 -->
                            <MessageBubble v-else :message="messages[virtualRow.index]" :is-self="isSelf(messages[virtualRow.index].fromUserId)"
                                @contextmenu="handleMessageContextMenu"
                                :class="{ 'is-self': isSelf(messages[virtualRow.index].fromUserId) }" />
                        </div>
                    </div>
                </div>
                <div v-else class="empty-messages">
                    开始聊天吧~
                </div>
            </div>

            <!-- Chat Sidebar -->
            <ChatSidebar :visible="sidebarVisible" :chat="currentSession" @close="sidebarVisible = false" @click.stop />

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
import { useVirtualizer } from '@tanstack/vue-virtual';

defineOptions({ name: 'SessionContent' });
import { useSessionStore } from '@/src/store/session';
import { useMessageStore } from '@/src/store/message';
import { useUserStore } from '@/src/store/user';
import { useGroupStore } from '@/src/store/group';
import { storeToRefs } from 'pinia';
import { extractTargetIdFromSessionId } from '@/src/utils/sessionUtils';
import MessageBubble from '@/src/views/home/chat/components/Bubble/MessageBubble.vue';
import SystemMessageBubble from '@/src/views/home/chat/components/Bubble/SystemMessageBubble.vue';
import { IChatMessage, ILocalTextMessage } from '@shared/types/chatMessage';
import { ImTypes } from '@shared/types';
import ChatInput from './components/ChatInput.vue';
import ChatSidebar from './components/Sidebar/index.vue';
import AiSuggestions from './components/AiSuggestions.vue';
import type { MenuOption } from '@/src/components/ContextMenu.vue';
import { ElMessage } from 'element-plus';
import { CallCalling, Copy, Trash, Undo } from 'reicon-vue';
import { windowService } from '@/src/services';
import { WindowKey } from '@shared/config/windowKeys';
import { useChatPage } from '@/src/composables/useChatPage';


const sessionStore = useSessionStore();
const messageStore = useMessageStore();
const userStore = useUserStore();
const groupStore = useGroupStore();

const { currentSession, currentSessionKey } = storeToRefs(sessionStore);
const { messages, isLoading, hasMore } = storeToRefs(messageStore);
const { loadMore, sendTextMessage, sendImageMessage, sendVideoMessage, sendFileMessage, recallMessage } = useChatPage();

// Sidebar Logic
const sidebarVisible = ref(false);

// 群会话侧栏展示的是成员视角信息（成员列表/群昵称/退群等），
// 已退群或被移出后不再允许打开；私聊侧栏不受限
const canOpenSidebar = computed(() => {
    if (!currentSession.value) return false;
    if (currentSession.value.type !== ImTypes.SessionType.SESSION_TYPE_GROUP) return true;
    const targetId = extractTargetIdFromSessionId(currentSessionKey.value, userStore.getUserID());
    return !!targetId && groupStore.isJoinedGroup(targetId);
});

const toggleSidebar = (event: MouseEvent) => {
    event.stopPropagation(); // Prevent immediate closing
    if (!canOpenSidebar.value) return;
    sidebarVisible.value = !sidebarVisible.value;
};

// Close sidebar when clicking outside
const closeSidebar = () => {
    if (sidebarVisible.value) {
        sidebarVisible.value = false;
    }
};

// 侧栏开着时被移出群/退群：立即收起，避免展示已失效的成员视角内容
watch(canOpenSidebar, (allowed) => {
    if (!allowed && sidebarVisible.value) {
        sidebarVisible.value = false;
    }
});

// Context Menu Logic
const menuVisible = ref(false);
const menuX = ref(0);
const menuY = ref(0);
const contextMenuTarget = ref<IChatMessage | null>(null);
const MessageType = ImTypes.MessageType;

const MessageStatus = ImTypes.MessageStatus;
const RECALL_WINDOW_MS = 2 * 60 * 1000; // 撤回时间窗口：2 分钟（与服务端一致）

const isSystemMessage = (type: number) => {
    const sysTypes = [
        MessageType.MSG_OP_RECALL,
        MessageType.GROUP_OP_NOTIFICATION,
    ];
    return sysTypes.includes(type);
};

// 撤回消息原类型不变但 status=RECALLED，与系统/通知消息一样居中渲染
const isSystemOrRecalled = (msg: IChatMessage) =>
    isSystemMessage(msg.type) || msg.status === MessageStatus.MESSAGE_STATUS_RECALLED;

const menuOptions = ref<MenuOption[]>([]);

const handleMessageContextMenu = (event: MouseEvent, message: IChatMessage) => {
    if (isSystemOrRecalled(message)) return;

    let options: MenuOption[] = [];

    if (message.type === MessageType.CHAT_TEXT || message.type === MessageType.GROUP_TEXT) {
        options = [
            { label: '复制', key: 'copy', icon: Copy }
        ];
    }
    options.push({ label: '删除', key: 'remove', icon: Trash });

    // 撤回：仅本人、已落库（有 msgId）、2 分钟内的消息（服务端亦校验）
    if (isSelf(message.fromUserId) && message.msgId
        && Date.now() - Number(message.sendTime) <= RECALL_WINDOW_MS) {
        options.push({ label: '撤回', key: 'recall', icon: Undo });
    }
    
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
    } else if (option.key === 'recall') {
        const target = contextMenuTarget.value;
        if (!target?.msgId) return;
        // 失败文案由请求拦截器统一 toast（如"超过撤回时间限制"）
        const ok = await recallMessage(target);
        if (ok) ElMessage.success('已撤回');
    }
};

// Computed

const title = computed(() => {
    if (!currentSession.value) return '';
    const targetId = extractTargetIdFromSessionId(currentSessionKey.value, userStore.getUserID());
    if (!targetId) return '';

    if (currentSession.value.type === ImTypes.SessionType.SESSION_TYPE_PRIVATE) {
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
    if (!currentSession.value) return '';
    const targetId = extractTargetIdFromSessionId(currentSessionKey.value, userStore.getUserID());
    if (!targetId) return '';

    // targetId 语义随会话类型变化（私聊=对方用户 ID、群聊=群 ID），
    // 必须按类型分别判断，合并判断会对所有会话恒成立
    if (currentSession.value.type === ImTypes.SessionType.SESSION_TYPE_PRIVATE) {
        if (!userStore.isFriend(targetId)) {
            return '您与对方非好友关系，无法发送消息';
        }
    } else if (!groupStore.isJoinedGroup(targetId)) {
        return '您已不在此群聊中，无法发送消息';
    }
    return '';
});

// Messages Layout and Virtualizer
const messageListRef = ref<HTMLElement | null>(null);

// Virtualizer setup for dynamic height chat bubbles
const virtualizer = useVirtualizer(computed(() => ({
    count: messages.value.length,
    getScrollElement: () => messageListRef.value,
    estimateSize: () => 80,
    overscan: 10,
    paddingStart: 20,
    paddingEnd: 20,
    getItemKey: (index: number) => {
        const msg = messages.value[index];
        return msg ? (msg.clientId || msg.msgId) : index;
    }
})));

// Animations for newly added messages
const newAnimMessageIds = ref(new Set<string>());
const seenMessageIds = new Set<string>();
let lastMessageId = '';
// 会话切换标记：缓存恢复时 messages 从旧会话数组直接替换为新会话数组（不经过空态），
// 消息 watcher 无法仅凭新旧数组区分"切换会话"与"追加新消息"，靠该标记识别
let sessionJustSwitched = false;

// Watch chat change to reset seen messages, animation set, and sidebar
// 注意：本 watcher 必须先于下方 messages watcher 注册（同一 flush 内按注册序执行），
// sessionJustSwitched 才能在 messages watcher 读取前置位
watch(currentSessionKey, () => {
    seenMessageIds.clear();
    newAnimMessageIds.value.clear();
    lastMessageId = '';
    sessionJustSwitched = true;

    if (currentSessionKey.value) {
        sidebarVisible.value = false;
    }
});

watch(() => [...messages.value], (newMsgs, oldMsgs) => {
    const isSessionSwitch = sessionJustSwitched;
    sessionJustSwitched = false;

    if (!newMsgs || newMsgs.length === 0) {
        seenMessageIds.clear();
        newAnimMessageIds.value.clear();
        lastMessageId = '';
        return;
    }

    // Check if we should scroll to bottom (last message changed)
    const newLastMsg = newMsgs[newMsgs.length - 1];
    const newLastMsgId = newLastMsg.clientId || newLastMsg.msgId;
    if (newLastMsgId !== lastMessageId) {
        lastMessageId = newLastMsgId;
        scrollToBottom();
    }

    // 首次加载或会话切换（含缓存恢复）：全部标记已读，不播放进场动画。
    // 否则恢复的列表比旧会话长时，尾部差量会被误判为"新消息"而重播动画
    if (isSessionSwitch || !oldMsgs || oldMsgs.length === 0) {
        newMsgs.forEach(m => {
            const id = m.clientId || m.msgId;
            if (id) seenMessageIds.add(id);
        });
        return;
    }
    
    const oldLength = oldMsgs.length;
    const newLength = newMsgs.length;
    
    if (newLength > oldLength) {
        const isPrepend = newMsgs[newMsgs.length - 1]?.msgId === oldMsgs[oldMsgs.length - 1]?.msgId;
        
        if (isPrepend) {
            // Prepended (historical messages): add them to seen so they don't animate
            for (let i = 0; i < newLength - oldLength; i++) {
                const id = newMsgs[i].clientId || newMsgs[i].msgId;
                if (id) seenMessageIds.add(id);
            }
        } else {
            // Appended (new sent/received messages): animate them
            for (let i = oldLength; i < newLength; i++) {
                const id = newMsgs[i].clientId || newMsgs[i].msgId;
                if (id && !seenMessageIds.has(id)) {
                    newAnimMessageIds.value.add(id);
                    seenMessageIds.add(id);
                    setTimeout(() => {
                        newAnimMessageIds.value.delete(id);
                    }, 1000);
                }
            }
        }
    }
});

const getMessageClass = (msg: IChatMessage) => {
    if (!msg) return {};
    const isSelfMsg = isSelf(msg.fromUserId);
    const id = msg.clientId || msg.msgId;
    return {
        'is-self': isSelfMsg,
        'is-new': id ? newAnimMessageIds.value.has(id) : false
    };
};

const scrollToBottom = () => {
    nextTick(() => {
        if (!virtualizer.value || messages.value.length === 0) return;
        const scrollOnce = () => {
            if (virtualizer.value && messages.value.length > 0) {
                virtualizer.value.scrollToIndex(messages.value.length - 1, { align: 'end' });
            }
        };
        scrollOnce();
        // 首次加载时条目高度只有 estimateSize 估算值，scrollToIndex 按估算偏移
        // 定位会落在偏上的位置；渲染后 measureElement 回填实测高度，这里连续
        // 几帧重试直到收敛到真正的底部（已测量过的会话第一帧即命中，重试无感）
        let attempts = 0;
        const settle = () => {
            if (attempts++ >= 3) return;
            scrollOnce();
            requestAnimationFrame(settle);
        };
        requestAnimationFrame(settle);
    });
};

const handleScroll = () => {
    const el = messageListRef.value;
    if (!el) return;
    
    // Check if scrolled near the top to load more historical messages
    if (el.scrollTop < 100 && !isLoading.value && hasMore.value) {
        const previousScrollHeight = el.scrollHeight;
        const previousScrollTop = el.scrollTop;
        
        loadMore().then(() => {
            nextTick(() => {
                if (messageListRef.value) {
                    const newScrollHeight = messageListRef.value.scrollHeight;
                    messageListRef.value.scrollTop = previousScrollTop + (newScrollHeight - previousScrollHeight);
                }
            });
        });
    }
};
// Auto scroll and load logic handled in messages watcher above

const handleSendMessage = async (content: string) => {
    await sendTextMessage(content);
};

const handleSendImage = async (file: File) => {
    try {
        await sendImageMessage(file);
    } catch {
        ElMessage.error('上传图片失败');
    }
};

const handleSendFile = async (file: File) => {
    try {
        if (file.type.startsWith('video/')) {
            await sendVideoMessage(file);
        } else {
            await sendFileMessage(file);
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
    if (!currentSession.value) return;
    // session_key 才是可解析的派生格式，session_id 为服务端分配 ID
    const targetId = extractTargetIdFromSessionId(currentSessionKey.value, userStore.getUserID());
    const targetType = currentSession.value.type === ImTypes.SessionType.SESSION_TYPE_PRIVATE ? 'private' : 'group';

    if (targetId) {
        windowService.createWindow(WindowKey.Call, {
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
        background: var(--surface-default, #ffffff);
        border-bottom: 1px solid var(--border-divider, #ececec);

        @supports (backdrop-filter: blur(10px)) or (-webkit-backdrop-filter: blur(10px)) {
            background: rgba(255, 255, 255, 0.8);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);

            [data-theme='dark'] & {
                background: rgba(30, 41, 59, 0.8);
            }
        }

        [data-theme='dark'] & {
            background: var(--surface-default, #1e293b);
            border-bottom: 1px solid var(--border-color, #334155);
        }

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
            flex-direction: row;
            align-items: center;
            gap: 4px;

            .icon-btn {
                width: 32px;
                height: 32px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 6px;
                cursor: pointer;
                color: var(--text-secondary);
                transition: background-color 0.2s, color 0.2s;

                &:hover {
                    background-color: var(--bg-hover);
                    color: var(--text-title);
                }

                &.disabled {
                    cursor: default;
                    color: var(--text-disabled);

                    &:hover {
                        background-color: transparent;
                    }
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

        .message-area {
            -webkit-app-region: no-drag;
            flex: 1;
            overflow-y: auto;
            padding: 0 20px;
            background-color: transparent; // Use transparent to blend with app background

            .empty-messages {
                height: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
                color: $color-text-placeholder;
                font-size: 14px;
            }

            @keyframes msg-slide-in-left {
                from {
                    opacity: 0;
                    transform: translateX(-20px);
                }
                to {
                    opacity: 1;
                    transform: translateX(0);
                }
            }

            @keyframes msg-slide-in-right {
                from {
                    opacity: 0;
                    transform: translateX(20px);
                }
                to {
                    opacity: 1;
                    transform: translateX(0);
                }
            }

            .virtual-item {
                will-change: transform;

                // 进场动画放在内层 .bubble-anim 上：外层 .virtual-item 的 transform
                // 承载虚拟列表定位的 translateY，若直接在其上跑 transform 关键帧动画，
                // 动画会覆盖内联 translateY，导致新消息在列表顶部播完动画才跳回原位
                &.is-new .bubble-anim {
                    animation: msg-slide-in-left 0.3s ease-out forwards;
                }

                &.is-new.is-self .bubble-anim {
                    animation: msg-slide-in-right 0.3s ease-out forwards;
                }
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
            background-color: var(--surface-default, #ffffff);
            flex-shrink: 0;
        }
    }
}

.empty-state {
    height: 100%;
    width: 100%;
}
</style>
