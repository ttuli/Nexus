<template>
    <div class="chat-content" v-if="currentSession" @click="closeSidebar">
        <!-- Header -->
        <div class="header">
            <span class="title">{{ title }}</span>
            <div class="actions">
                <!-- 仅语音通话：视频入口已下线（服务器出向带宽不足以做 TURN 中转视频，
                     详见 useCallState 头注释）。
                     音频 SDP 没有 video m-line，通话中也不提供开摄像头入口 -->
                <template v-if="currentSession.type === ImTypes.SessionType.SESSION_TYPE_PRIVATE">
                    <div class="icon-btn" title="语音通话" @click="startCall()">
                        <CallCalling class="app-icon app-icon--sm" />
                    </div>
                </template>
                <div class="icon-btn" :class="{ disabled: !canOpenSidebar }" title="聊天信息" @click="toggleSidebar">⋮</div>
            </div>
        </div>

        <!-- Content Area (Relative for Sidebar) -->
        <div class="content-wrapper">
            <!-- Message List -->
            <div class="message-area scroll-bar-thin" ref="messageListRef" @scroll="handleScroll">
                <!-- 行不能和容器在同一次更新里新建：行的 ref 回调触发那一刻它还没插进文档，量出的高度是 0，
                     首屏「滚到底」会先停在离顶部很近的地方，顺带误触发一次往更早翻页。所以容器常驻、不随有无消息 v-if
                     （没有消息时高度为 0，不挤占空状态）；从空白页切到有缓存的会话时，消息区和消息同时出现，
                     等消息区挂载好（messageListRef 有值）再渲染行 -->
                <div :style="{ height: `${messages.length > 0 ? virtualizer.getTotalSize() : 0}px`, width: '100%', position: 'relative' }">
                    <div
                        v-for="virtualRow in (messageListRef ? virtualizer.getVirtualItems() : [])"
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
                        <!-- 时间分组的第一条：上方显示这一组的时间戳。放在动画包裹层外面，进场动画的位移和定位闪烁的底色都不带上它 -->
                        <div v-if="timeGroupStarts[virtualRow.index]" class="time-divider"
                            :class="{ 'before-system': isSystemOrRecalled(messages[virtualRow.index]) }">
                            {{ formatMessageTime(messages[virtualRow.index].sendTime, today) }}
                        </div>
                        <!-- 动画包裹层：进场动画的 transform 必须与外层虚拟定位的 translateY 隔离 -->
                        <div class="bubble-anim">
                            <!-- 系统 / 群通知 / 已撤回消息气泡 -->
                            <SystemMessageBubble v-if="isSystemOrRecalled(messages[virtualRow.index])" :message="(messages[virtualRow.index] as any)" />
                            <!-- 普通用户聊天气泡 -->
                            <MessageBubble v-else :message="messages[virtualRow.index]" :is-self="isSelf(messages[virtualRow.index].fromUserId)"
                                @contextmenu="handleMessageContextMenu" @resend="handleResendMessage" />
                        </div>
                    </div>
                </div>
                <div v-if="messages.length === 0" class="empty-messages">
                    开始聊天吧~
                </div>
            </div>

            <!-- 跳转定位后：列表不是最新的一段，或停在定位到的消息上（新消息不把视图拉到底） -->
            <div v-if="hasNewer || (holdPosition && !isAtBottom)" class="back-to-latest"
                :style="{ bottom: `${inputHeight + 16}px` }" @click="goLatest">
                回到最新
            </div>

            <!-- Chat Sidebar -->
            <ChatSidebar :visible="sidebarVisible" :chat="currentSession" @close="sidebarVisible = false" @click.stop />

            <ContextMenu v-model:visible="menuVisible" :x="menuX" :y="menuY" :options="menuOptions"
                @select="handleMenuSelect" />

            <!-- Resize Handle -->
            <div class="resize-handle" @mousedown="startResize"></div>

            <!-- Input Area -->
            <div class="input-area" :style="{ height: inputHeight + 'px' }">
                <ChatInput :disable-reason="chatDisableReason" @send="handleSendMessage"
                    @sendImage="handleSendImage" @sendFile="handleSendFile"
                    @openHistory="openHistory" />
            </div>
        </div>
    </div>
    <BlankPage v-else />
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onActivated, onDeactivated } from 'vue';
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
import ChatInput from './components/ChatInput/ChatInput.vue';
import ChatSidebar from './components/Sidebar/index.vue';
import type { MenuOption } from '@/src/components/ContextMenu.vue';
import { ElMessage } from 'element-plus';
import CusDialog from '@/src/components/CusDialog';
import { DialogResult } from '@/src/components/CusDialog/types';
import { CallCalling, Copy, Refresh, Trash, Undo } from 'reicon-vue';
import { windowService } from '@/src/services';
import { WindowKey } from '@shared/config/windowKeys';
import { seqPositive } from '@shared/utils/seq';
import { useChatPage } from '@/src/composables/useChatPage';
import { loadNewerMessages, returnToLatest } from '@/src/composables/messageJump';
import { useToday } from '@/src/composables/useToday';
import { formatMessageTime, startsTimeGroup } from '@/src/utils/messageTime';
import { isSystemNotificationMessage } from '@/src/utils/messageConverter';
import { getSessionTitle } from '@/src/utils/displayName';
import { copyToClipboard } from '@/src/utils/clipboard';
import { openAudioCallWindow } from '@/src/utils/window';


const sessionStore = useSessionStore();
const messageStore = useMessageStore();
const userStore = useUserStore();
const groupStore = useGroupStore();

const { currentSession, currentSessionKey } = storeToRefs(sessionStore);
const { messages, isLoading, hasMore, hasNewer, jumpRequest } = storeToRefs(messageStore);
const { loadMore, sendTextMessage, sendImageMessage, sendVideoMessage, sendFileMessage, resendMessage, recallMessage, deleteMessage } = useChatPage();

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

// 撤回消息原类型不变但 status=RECALLED，与系统/通知消息一样居中渲染
const isSystemOrRecalled = (msg: IChatMessage) =>
    isSystemNotificationMessage(msg.type) || msg.status === MessageStatus.MESSAGE_STATUS_RECALLED;

const menuOptions = ref<MenuOption[]>([]);

const handleMessageContextMenu = (event: MouseEvent, message: IChatMessage) => {
    if (isSystemOrRecalled(message)) return;

    let options: MenuOption[] = [];

    if (isSelf(message.fromUserId) && message.status === MessageStatus.MESSAGE_STATUS_FAILED && !chatDisableReason.value) {
        options.push({ label: '重新发送', key: 'resend', icon: Refresh });
    }

    if (message.type === MessageType.CHAT_TEXT || message.type === MessageType.GROUP_TEXT) {
        options.push({ label: '复制', key: 'copy', icon: Copy });
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
    if (option.key === 'resend') {
        await handleResendMessage(contextMenuTarget.value);
    } else if (option.key === 'copy') {
        let content = '';
        if (contextMenuTarget.value.type === MessageType.CHAT_TEXT || contextMenuTarget.value.type === MessageType.GROUP_TEXT) {
            content = (contextMenuTarget.value as ILocalTextMessage).content;
        }

        if (content) {
            await copyToClipboard(content);
        }
    } else if (option.key === 'recall') {
        const target = contextMenuTarget.value;
        if (!target?.msgId) return;
        // 失败文案由请求拦截器统一 toast（如"超过撤回时间限制"）
        const ok = await recallMessage(target);
        if (ok) ElMessage.success('已撤回');
    } else if (option.key === 'remove') {
        const target = contextMenuTarget.value;
        // 删除仅作用于本机，且会记墓碑（翻页回源也不会再拉回来），故不可恢复
        const res = await CusDialog.open({
            title: '删除消息',
            content: '该消息将从本设备永久删除，确定删除吗？',
            showCancel: true,
            confirmText: '确定删除',
            cancelText: '取消',
        });
        if (res !== DialogResult.Confirm) return;

        const ok = await deleteMessage(target);
        if (ok) {
            ElMessage.success('已删除');
        } else {
            ElMessage.error('删除失败');
        }
    }
};

// Computed

const title = computed(() => getSessionTitle(currentSession.value));

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

// ─── 时间分组 ───────────────────────────────────────────────────────────────

/** 今天零点：时间戳的写法（今天 / 昨天 / 星期几）靠它来算，跨天后它变一次，屏幕上的时间戳随之重算 */
const today = useToday();

/**
 * 每条消息是否是所在时间分组的第一条（上方显示时间戳）。只看相邻两条的发送时间，与当前时间无关：
 * 新消息到了跟上一条比一次就定下来，跨天时分组不用重算
 */
const timeGroupStarts = computed(() => {
    const list = messages.value;
    return list.map((msg, index) => startsTimeGroup(msg.sendTime, list[index - 1]?.sendTime));
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

// ─── 列表前面插入消息时保持视口不动（往更早翻页、后台补齐） ────────────────────

/** 主动滚动（滚到底、定位）或换会话时自增，让还没做完的位置补偿作废，免得把滚好的位置又拉回去 */
let anchorGeneration = 0;
/** 正在替浏览器提前补发一次 scroll 事件给虚拟列表（见 restoreAfterPrepend）：这一次不是用户在滚，不走翻页等逻辑 */
let syncingVirtualizer = false;

const messageKey = (msg: IChatMessage) => msg.clientId || msg.msgId;

/**
 * 列表变长时，在 DOM 更新前（读到的还是旧的行）记下锚点：视口里第一条仍在新列表里的消息，以及它那一行的底边离视口顶部的距离。
 * 它前面没有插入消息时返回 null，不用补偿。
 * 记底边而不是顶边：行高的变化（时间戳出现 / 消失）都发生在行的顶部，气泡相对底边的位置不变
 */
const findPrependAnchor = (el: HTMLElement, prev: IChatMessage[], next: IChatMessage[]) => {
    if (next.length <= prev.length) return null;
    const viewTop = el.getBoundingClientRect().top;
    const nextIndexes = new Map(next.map((msg, index) => [messageKey(msg), index]));
    const rows = [...el.querySelectorAll<HTMLElement>('.virtual-item')]
        .map(row => ({ row, index: Number(row.dataset.index) }))
        .sort((a, b) => a.index - b.index);
    for (const { row, index } of rows) {
        const key = prev[index] && messageKey(prev[index]);
        const nextIndex = key ? nextIndexes.get(key) : undefined;
        const bottom = row.getBoundingClientRect().bottom - viewTop;
        if (bottom <= 0 || nextIndex === undefined) continue;
        return nextIndex > index ? { key, bottom } : null;
    }
    return null;
};

/**
 * DOM 更新后把锚点放回原来的位置。分两步，都在这一帧绘制之前完成：
 * 1. 按虚拟列表当前认为的行高（刚插入的行大多还是估算值）先定位一次；
 * 2. 让虚拟列表立刻按新位置渲染出锚点附近的行，把渲染出来的行按实际高度登记，再定位一次。
 *
 * 不能只做第 1 步、等新行渲染出来由虚拟列表自己补偿：它一批行用的是测量前的位置去判断「是否在视口上方」，
 * 紧挨视口顶边的那一行常被漏掉（实测差 2px，行高和估算值差得多时更多）。
 * 原来带时间戳、现在不带了的行（翻页前的第一条），缓存里还是带时间戳时的高度，也在第 2 步一并改正
 */
const restoreAfterPrepend = (anchor: { key: string; bottom: number }) => {
    const gen = ++anchorGeneration;
    nextTick(async () => {
        const el = messageListRef.value;
        const index = messages.value.findIndex(msg => messageKey(msg) === anchor.key);
        if (!el || index < 0 || gen !== anchorGeneration) return;
        const list = virtualizer.value;
        const placeAnchor = () => {
            // measurementsCache 要等下次重算才带上刚登记的高度：先调 getVirtualItems() 让它重算，再取锚点的位置
            list.getVirtualItems();
            const item = list.measurementsCache[index];
            if (item) el.scrollTop = item.end - anchor.bottom;
        };

        placeAnchor();
        // 浏览器要到下一帧才派发 scroll 事件，在那之前虚拟列表不知道位置变了：替它补发一次
        syncingVirtualizer = true;
        el.dispatchEvent(new Event('scroll'));
        syncingVirtualizer = false;
        await nextTick();
        if (gen !== anchorGeneration || messageListRef.value !== el) return;

        const heights = [...el.querySelectorAll<HTMLElement>('.virtual-item')]
            .map(row => ({ index: Number(row.dataset.index), height: row.offsetHeight }));
        heights.forEach(row => list.resizeItem(row.index, row.height));
        placeAnchor();
    });
};

// ─── 跳转定位（历史消息窗口双击某条消息）的视图状态 ─────────────────────────

/** 离底部小于这个距离算「在底部」 */
const AT_BOTTOM_PX = 24;
/** 跳转窗口里离底部小于这个距离时，往更新的方向翻一页 */
const LOAD_NEWER_PX = 100;
/** 定位到的消息闪烁的时长，与 msg-flash 动画一致 */
const FLASH_MS = 1600;

/**
 * 正在看定位到的消息：别人的新消息不把视图拉到底部。
 * 自己滚回底部、点「回到最新」、自己发消息、切换会话时解除
 */
const holdPosition = ref(false);
/** 当前是否停在列表底部（「回到最新」按钮显隐用） */
const isAtBottom = ref(true);
/** 正在闪烁的消息 */
const flashMsgId = ref('');
let flashTimer: ReturnType<typeof setTimeout> | undefined;
/** 每次定位自增：让还在进行的「滚到底部」逐帧重试作废，免得把定位好的位置又拉到底 */
let scrollGeneration = 0;

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
    holdPosition.value = false;
    isAtBottom.value = true;
    flashMsgId.value = '';
    anchorGeneration++;

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

    // 列表前面插入了消息（往更早翻页、后台补齐）：视口里正在看的内容保持不动。本 watcher 在组件更新前执行，DOM 还是旧的。
    // 要先于下面可能的「滚到底」登记，滚到底会让这次补偿作废；切换会话、有待执行的定位时，滚到哪由它们各自决定
    const listEl = messageListRef.value;
    if (listEl && !isSessionSwitch && oldMsgs?.length && !jumpRequest.value) {
        const anchor = findPrependAnchor(listEl, oldMsgs, newMsgs);
        if (anchor) restoreAfterPrepend(anchor);
    }

    // Check if we should scroll to bottom (last message changed)
    const newLastMsg = newMsgs[newMsgs.length - 1];
    const newLastMsgId = newLastMsg.clientId || newLastMsg.msgId;
    if (newLastMsgId !== lastMessageId) {
        lastMessageId = newLastMsgId;
        // 自己刚发出的消息（还没拿到 seq）一律回到底部；否则跳转定位相关的三种情况不滚：
        // 有待执行的定位（由下面的定位 watcher 负责滚动）、跳转窗口（尾部不是最新）、正在看定位到的消息
        const freshSelfSend = isSelf(newLastMsg.fromUserId) && !seqPositive(newLastMsg.seq);
        if (freshSelfSend) {
            holdPosition.value = false;
            scrollToBottom();
        } else if (!jumpRequest.value && !hasNewer.value && !holdPosition.value) {
            scrollToBottom();
        }
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
        'is-new': id ? newAnimMessageIds.value.has(id) : false,
        'is-flash': !!msg.msgId && msg.msgId === flashMsgId.value,
    };
};

const scrollToBottom = () => {
    // 要滚到底了：还没做完的位置补偿作废
    anchorGeneration++;
    const gen = scrollGeneration;
    nextTick(() => {
        if (!virtualizer.value || messages.value.length === 0 || gen !== scrollGeneration) return;
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
            // 期间发生了跳转定位：不再往底部拉
            if (attempts++ >= 3 || gen !== scrollGeneration) return;
            scrollOnce();
            requestAnimationFrame(settle);
        };
        requestAnimationFrame(settle);
    });
};

/** 定位到的消息闪两下；同一条消息连续定位时先摘掉 class，下一帧再加上，动画才会重播 */
const flashMessage = (msgId: string) => {
    clearTimeout(flashTimer);
    flashMsgId.value = '';
    requestAnimationFrame(() => {
        flashMsgId.value = msgId;
        flashTimer = setTimeout(() => { flashMsgId.value = ''; }, FLASH_MS);
    });
};

/**
 * 本页是否在显示。本页在 keep-alive 里缓存：从联系人页跳过来时，定位请求可能早于本页激活，
 * 隐藏时滚动不生效，请求要留到激活后再执行
 */
let isPageActive = true;
onActivated(() => {
    isPageActive = true;
    if (jumpRequest.value) handleJumpRequest(jumpRequest.value);
});
onDeactivated(() => {
    isPageActive = false;
});

// 定位请求（messageJump 在目标已在列表里、或跳转窗口加载好后发出）：滚到目标居中并闪烁。
// immediate：本组件可能在请求发出之后才挂载
watch(jumpRequest, (request) => {
    if (request) handleJumpRequest(request);
}, { immediate: true });

function handleJumpRequest(request: { msgId: string }) {
    if (!isPageActive) return;
    messageStore.clearJumpRequest();
    scrollGeneration++;
    anchorGeneration++;
    holdPosition.value = true;
    nextTick(() => {
        const index = messages.value.findIndex(m => m.msgId === request.msgId);
        if (index < 0) return;
        // 动态高度下 scrollToIndex 会随实测高度逐帧校正，直到稳定
        virtualizer.value.scrollToIndex(index, { align: 'center' });
        flashMessage(request.msgId);
    });
}

/** 「回到最新」：跳转窗口要重新加载最新一页（加载完由 messages watcher 滚到底），否则直接滚到底 */
const goLatest = async () => {
    holdPosition.value = false;
    if (hasNewer.value) {
        await returnToLatest();
    } else {
        scrollToBottom();
    }
};

const handleScroll = () => {
    const el = messageListRef.value;
    if (!el || syncingVirtualizer) return;

    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isAtBottom.value = distanceToBottom < AT_BOTTOM_PX;
    // 跳转窗口：接近底部时往更新的方向翻一页（追加在下方，视口里的内容不动，不用补偿）
    if (hasNewer.value && distanceToBottom < LOAD_NEWER_PX && !isLoading.value) {
        void loadNewerMessages();
    }
    // 自己滚回了最新的底部：解除定位锁定，之后的新消息照常跟到底
    if (!hasNewer.value && isAtBottom.value) holdPosition.value = false;

    // Check if scrolled near the top to load more historical messages
    // 更早的一页插到列表前面后，视口保持不动由消息 watcher 负责（见 restoreAfterPrepend）
    if (el.scrollTop < 100 && !isLoading.value && hasMore.value) {
        void loadMore();
    }
};
// Auto scroll and load logic handled in messages watcher above

const handleSendMessage = async (content: string) => {
    await sendTextMessage(content);
};

const handleResendMessage = async (message: IChatMessage) => {
    if (message.status !== MessageStatus.MESSAGE_STATUS_FAILED) return;
    if (chatDisableReason.value) {
        ElMessage.warning(chatDisableReason.value);
        return;
    }
    const res = await CusDialog.open({
        title: '重新发送',
        content: '确定要重新发送这条消息吗？',
        showCancel: true,
        confirmText: '重新发送',
        cancelText: '取消',
    });
    if (res !== DialogResult.Confirm) return;

    await resendMessage(message);
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

const openHistory = () => {
    if (!currentSessionKey.value) return;
    windowService.createWindow(WindowKey.History, { sessionKey: currentSessionKey.value });
};

const startCall = () => {
    if (!currentSession.value) return;
    // session_key 才是可解析的派生格式，session_id 为服务端分配 ID
    const targetId = extractTargetIdFromSessionId(currentSessionKey.value, userStore.getUserID());
    if (!targetId) return;

    openAudioCallWindow(targetId, currentSessionKey.value);
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
.chat-content {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    background-color: $bg-body;
    position: relative;
    overflow: hidden; // Ensure sidebar doesn't overflow container
    // 自成层叠上下文：内部 header / 侧栏的 z-index 只在本组件内比较，
    // 不会盖过外层 TitleBar（z-index: 1）的窗口按钮
    isolation: isolate;

    .header {
        // 压在侧栏（z-index: 100）之上，遮住侧栏合成层顶部取整产生的 1px 缝隙
        position: relative;
        z-index: 101;
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
            // 列表前面插入消息时自己按锚点补回滚动位置（见 restoreAfterPrepend），不让浏览器的滚动锚定再调一次
            overflow-anchor: none;

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

            @keyframes msg-fade-in {
                from {
                    opacity: 0;
                }
                to {
                    opacity: 1;
                }
            }

            .virtual-item {
                will-change: transform;

                // 时间分组的时间戳：居中的一行小字，离上一条 20px（上一行自带的下边距）、离本条 16px
                .time-divider {
                    padding-bottom: 16px;
                    font-size: 12px;
                    line-height: 18px;
                    text-align: center;
                    color: $color-text-placeholder;
                    user-select: none;

                    // 后面是系统提示时，提示自带 16px 的上边距，不再另加
                    &.before-system {
                        padding-bottom: 0;
                    }
                }

                // 新消息另起一组时，时间戳跟着淡入（气泡的进场动画在 .bubble-anim 上，带不到它）
                &.is-new .time-divider {
                    animation: msg-fade-in 0.3s ease-out;
                }

                // 进场动画放在内层 .bubble-anim 上：外层 .virtual-item 的 transform
                // 承载虚拟列表定位的 translateY，若直接在其上跑 transform 关键帧动画，
                // 动画会覆盖内联 translateY，导致新消息在列表顶部播完动画才跳回原位
                &.is-new .bubble-anim {
                    animation: msg-slide-in-left 0.3s ease-out forwards;
                }

                &.is-new.is-self .bubble-anim {
                    animation: msg-slide-in-right 0.3s ease-out forwards;
                }

                // 跳转定位到的消息：整行底色亮两下再淡出（时长与 FLASH_MS 一致）
                &.is-flash .bubble-anim {
                    border-radius: 8px;
                    animation: msg-flash 1.6s ease-in-out;
                }
            }

            @keyframes msg-flash {
                0%, 40%, 100% {
                    background-color: transparent;
                }

                15%, 60% {
                    background-color: color-mix(in srgb, var(--color-primary) 16%, transparent);
                }
            }
        }

        .back-to-latest {
            -webkit-app-region: no-drag;
            position: absolute;
            right: 24px;
            z-index: 12;
            padding: 6px 14px;
            border: 1px solid $color-border;
            border-radius: 16px;
            background-color: $bg-card;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
            font-size: 12px;
            color: $color-primary;
            cursor: pointer;
            user-select: none;
            transition: background-color 0.15s ease;

            &:hover {
                background-color: $bg-hover;
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
</style>
