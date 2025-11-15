<template>
    <div class="chat-container">
        <!-- 聊天头部 -->
        <div class="chat-header">
            <div class="chat-user-info">
                <Avatar :source="getInfoById(chatStore.selectedChat?.id as bigint)?.avatar" class="chat-user-avatar" />
                <div class="chat-user-details">
                    <div class="chat-user-name">{{ getInfoById(chatStore.selectedChat?.id as bigint)?.name }}</div>
                    <!-- <div class="chat-user-status">{{ getInfoById(chatStore.selectedChatId)?.status || '在线' }}</div> -->
                </div>
            </div>
            <div class="chat-actions">
                <button title="语音通话">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path
                            d="M6.62 10.79c1.44 2.83 3.76 5.15 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V21c0 .55-.45 1-1 1C10.07 22 2 13.93 2 4c0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.24.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
                    </svg>
                </button>
                <button title="视频通话">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path
                            d="M17 10.5V7c0-1.1-.9-2-2-2H5C3.9 5 3 5.9 3 7v10c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2v-3.5l4 4v-11l-4 4z" />
                    </svg>
                </button>
            </div>
        </div>

        <!-- 可拖拽分割视图：消息列表 / 分割条 / 输入区域 -->
        <div class="chat-body" ref="chatBodyRef">
            <div class="messages-container" ref="messagesContainer" :style="{ height: messagesHeight + 'px' }">
                <template v-for="item in groupedItems" :key="item.t === 'msg' ? item.m.seqid : 'divider-'+item.ts">
                    <div v-if="item.t === 'divider'" class="time-divider">{{ formatDividerTime(item.ts) }}</div>
                    <div v-else class="message" :class="{ 'own-message': item.m.sender_id === userStore.userInfo.user_id }">
                        <div class="message-avatar" v-if="item.m.sender_id !== userStore.userInfo.user_id">
                            <Avatar :source="relationStore.getUser(item.m.sender_id as bigint)?.avatar" />
                        </div>
                        <div class="message-content">
                            <div class="message-bubble" :class="{ 'has-status-icon': item.m.status === MessageStatus.Sending || item.m.status === MessageStatus.Failed }">
                                <div class="message-text">{{ item.m.content }}</div>
                                <span class="spinner" v-if="item.m.status === MessageStatus.Sending" title="发送中" aria-hidden="true"></span>
                                <span class="status-icon error" v-if="item.m.status === MessageStatus.Failed" title="重新发送" aria-hidden="true" @click="resendMsg(item.m)">!</span>
                            </div>
                            <div class="message-time" v-if="chatStore.selectedChat?.type !== 'friend'">{{ formatMessageTime(item.m.timestamp) }}</div>
                        </div>
                    </div>
                </template>
            </div>
            <div class="split-handle" @mousedown="startDrag" title="拖动调整消息区高度"></div>
            <div class="input-area">
                <div class="input-toolbar">
                    <button class="toolbar-btn" title="表情" @click="toggleEmojiPicker" ref="emojiBtnRef">😊</button>
                    <button class="toolbar-btn" title="文件">📎</button>
                    <button class="toolbar-btn" title="图片">🖼️</button>
                </div>
                <div class="input-container">
                    <textarea v-model="messageInput" placeholder="输入消息..." class="message-input"
                        @keydown="handleInputKeydown" rows="2" ref="messageInputRef"></textarea>
                    <button class="send-btn" :disabled="!messageInput.trim()" @click="sendMessage">
                        发送
                    </button>
                </div>
                <!-- Emoji Picker -->
                <div v-if="showEmojiPicker" class="emoji-picker" ref="emojiPickerRef" @mousedown.prevent>
                    <div class="emoji-header">常用表情</div>
                    <div class="emoji-grid">
                        <button v-for="emoji in emojis" :key="emoji" class="emoji-item" @click="pickEmoji(emoji)">
                            {{ emoji }}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script lang="ts" setup>
import { ref, nextTick, onMounted, onBeforeUnmount, computed, watch } from 'vue'
import Avatar from '@/components/Avatar.vue'
import { useChatStore } from '@/store/chat'
import { useUserStore } from '@/store/user'
import { useRelationStore } from '@/store/relationMap'
import { ElMessage } from 'element-plus'
import { WebSocketCli } from '@/websocket'
import { v4 as uuidv4 } from 'uuid'
import { MsgType, MessageStatus, ChatMessage } from "@/models/message"

const chatStore = useChatStore()
const relationStore = useRelationStore()
const userStore = useUserStore()

const messageInput = ref('')
const messagesContainer = ref<HTMLElement>()
const messageInputRef = ref<HTMLTextAreaElement>()
const chatBodyRef = ref<HTMLElement>()

const showEmojiPicker = ref(false)
const emojiPickerRef = ref<HTMLElement>()
const emojiBtnRef = ref<HTMLElement>()
const emojis = [
    '😀', '😁', '😂', '🤣', '😊', '😍', '😎', '😢', '😅', '😡', '😴', '🤔', '🥳', '🤩', '🤗', '🙏', '👏', '👍', '👎', '🔥', '🎉', '❤️', '✨', '💯', '😇', '😭', '🤤', '🤮', '🙈', '🙉', '🙊'
]

const WINDOW_SIZE_DEFAULT = 200
const WINDOW_STEP = 100
const windowSize = ref(WINDOW_SIZE_DEFAULT)
const allMessages = computed(() => chatStore.chatMsgs.get(chatStore.selectedChat?.session_id as string) || [])
const windowMessages = computed(() => {
    const list = allMessages.value
    const start = Math.max(0, list.length - windowSize.value)
    return list.slice(start)
})
type RenderItem = { t: 'divider', ts: number } | { t: 'msg', m: ChatMessage }
const GROUP_GAP_MS = 5 * 60 * 1000
const groupedItems = computed<RenderItem[]>(() => {
    const res: RenderItem[] = []
    const list = windowMessages.value
    let prev = 0
    for (const m of list) {
        if (prev && m.timestamp - prev > GROUP_GAP_MS) {
            res.push({ t: 'divider', ts: m.timestamp })
        }
        res.push({ t: 'msg', m })
        prev = m.timestamp
    }
    return res
})
// Split view state
const messagesHeight = ref(260) // 初始高度，后续在mounted按容器高度调整
const dragging = ref(false)
let startY = 0
let startHeight = 0
const HANDLE_HEIGHT = 6
const MIN_MESSAGES_HEIGHT = 120
const MIN_INPUT_HEIGHT = 240

const getInfoById = (id: bigint | null) => {
    if (!id) return null
    const chat = chatStore.getChat(id)
    if (!chat) return null
    return {
        id: chat.id,
        name: chat.type === 'friend' ? relationStore.getUser(chat.id)?.user_name : relationStore.getGroup(chat.id)?.name,
        avatar: chat.type === 'friend' ? relationStore.getUser(chat.id)?.avatar : relationStore.getGroup(chat.id)?.avatar,
    }
}

const sendMessage = () => {
    const content = messageInput.value.trim()
    if (content.length > 200) {
        ElMessage.warning('消息长度不能超过200个字符')
        return
    }
    if (!content || !chatStore.selectedChat) {
        ElMessage.warning('请输入消息')
        return
    }
    messageInput.value = ''
    const msg = {
        id: uuidv4(),
        msgType: MsgType.Text,
        timestamp: new Date().getTime(),
        content,
        sender_id: userStore.userInfo.user_id,
        session_id: chatStore.selectedChat.session_id,
        status: MessageStatus.Sending,
        receivers: relationStore.GetMemberBySessionId(chatStore.selectedChat.session_id),
    }
    chatStore.parseWsMessage(msg)
    WebSocketCli.SendMessage(msg)
    nextTick(() => {
        scrollToBottom()
    })
}

const handleInputKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        sendMessage()
    }
}

const resendMsg = (msg: ChatMessage) => {
    if (msg.status !== MessageStatus.Failed) {
        ElMessage.warning('只有失败的消息才能重新发送')
        return
    }
    msg.status = MessageStatus.Sending
    msg.timestamp = new Date().getTime()
    chatStore.parseWsMessage({
        id:msg.id,
        session_id:msg.sessionId,
        seq_id:msg.seqid,
        timestamp:msg.timestamp,
        content:msg.content,
        status:msg.status,
        sender_id:msg.sender_id,
        receivers: relationStore.GetMemberBySessionId(msg.sessionId),
    })
    WebSocketCli.SendMessage(msg)
    nextTick(() => {
        scrollToBottom()
    })
}

const toggleEmojiPicker = () => {
    showEmojiPicker.value = !showEmojiPicker.value
}

const pickEmoji = (emoji: string) => {
    const el = messageInputRef.value
    if (!el) return
    const start = el.selectionStart ?? messageInput.value.length
    const end = el.selectionEnd ?? start
    const text = messageInput.value
    messageInput.value = text.slice(0, start) + emoji + text.slice(end)
    nextTick(() => {
        el.focus()
        const caret = start + emoji.length
        el.setSelectionRange(caret, caret)
        showEmojiPicker.value = false
    })
}

const onWindowClick = (e: MouseEvent) => {
    if (!showEmojiPicker.value) return
    const target = e.target as HTMLElement
    const pickerEl = emojiPickerRef.value
    const btnEl = emojiBtnRef.value
    if (pickerEl && (pickerEl === target || pickerEl.contains(target))) return
    if (btnEl && (btnEl === target || btnEl.contains(target))) return
    showEmojiPicker.value = false
}

const scrollToBottom = () => {
    if (messagesContainer.value) {
        messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
}

const onMessagesScroll = () => {
    const el = messagesContainer.value
    if (!el) return
    if (el.scrollTop <= 0) {
        if (allMessages.value.length > windowSize.value) {
            const prevHeight = el.scrollHeight
            windowSize.value = Math.min(windowSize.value + WINDOW_STEP, allMessages.value.length)
            nextTick(() => {
                const newHeight = el.scrollHeight
                el.scrollTop = newHeight - prevHeight
            })
        }
    }
}

const formatMessageTime = (dateLike: Date | string | number) => {
    const date = dateLike instanceof Date ? dateLike : new Date(dateLike)
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}
const formatDividerTime = (dateLike: number) => {
    const date = new Date(dateLike)
    return date.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// 分割条拖拽逻辑
const startDrag = (e: MouseEvent) => {
    if (!chatBodyRef.value) return
    dragging.value = true
    startY = e.clientY
    startHeight = messagesHeight.value
    window.addEventListener('mousemove', onDrag)
    window.addEventListener('mouseup', stopDrag)
}

const onDrag = (e: MouseEvent) => {
    if (!dragging.value || !chatBodyRef.value) return
    const delta = e.clientY - startY
    const bodyH = chatBodyRef.value.clientHeight
    const maxMessagesHeight = Math.max(MIN_MESSAGES_HEIGHT, bodyH - MIN_INPUT_HEIGHT - HANDLE_HEIGHT)
    const nextH = Math.min(Math.max(startHeight + delta, MIN_MESSAGES_HEIGHT), maxMessagesHeight)
    messagesHeight.value = nextH
}

const stopDrag = () => {
    dragging.value = false
    window.removeEventListener('mousemove', onDrag)
    window.removeEventListener('mouseup', stopDrag)
}

onMounted(() => {
    // 初始设置为容器高度的70%
    const h = chatBodyRef.value?.clientHeight || 0
    if (h > 0) {
        messagesHeight.value = Math.max(MIN_MESSAGES_HEIGHT, Math.floor(h * 0.7))
    }
    window.addEventListener('click', onWindowClick)
    messagesContainer.value?.addEventListener('scroll', onMessagesScroll)
})

onBeforeUnmount(() => {
    stopDrag()
    window.removeEventListener('click', onWindowClick)
    messagesContainer.value?.removeEventListener('scroll', onMessagesScroll)
})

watch(() => chatStore.selectedChat?.session_id || '', async () => {
    windowSize.value = WINDOW_SIZE_DEFAULT
    nextTick(() => {
        scrollToBottom()
    })
}, { immediate: true })
</script>

<style scoped>
.chat-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    -webkit-app-region: no-drag;
}

.chat-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    /* 允许子容器在flex中正确滚动，避免撑开父容器 */
}

.chat-header {
    padding: 15px 20px;
    border-bottom: 1px solid #e1e8ed;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #fafbfc;
}

.chat-user-info {
    display: flex;
    align-items: center;
}

.chat-user-avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    margin-right: 12px;
    object-fit: cover;
}

.chat-user-name {
    font-weight: 600;
    font-size: 16px;
    color: #2c3e50;
    margin-bottom: 2px;
}

.chat-user-status {
    font-size: 12px;
    color: #27ae60;
}

.chat-actions {
    display: flex;
    gap: 8px;

    button {
        background: none;
        border: none;
        font-size: 0;
        /* 使用 SVG，不依赖字体大小 */
        cursor: pointer;
        padding: 5px;
        border-radius: 4px;
        transition: background 0.2s;

        &:hover {
            background: #e8ebee;
        }
    }

    svg {
        width: 20px;
        height: 20px;
        fill: #6c757d;
        display: block;
    }

    button:hover svg {
        fill: #343a40;
    }
}

.messages-container {
    flex: 0 0 auto;
    /* 由显式高度控制 */
    overflow-y: auto;
    padding: 20px;
    background: #f8f9fa;
}
.time-divider {
    text-align: center;
    font-size: 12px;
    color: #95a5a6;
    margin: 10px 0;
}

.split-handle {
    height: 6px;
    background: linear-gradient(180deg, #eef2f6, #e3e8ee);
    border-top: 1px solid #e1e8ed;
    border-bottom: 1px solid #e1e8ed;
    cursor: row-resize;
    position: relative;
}

.split-handle::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 60px;
    height: 2px;
    background: #cfd6dd;
    border-radius: 2px;
}

.message {
    display: flex;
    margin-bottom: 20px;
    align-items: flex-start;
    width: 100%;
    /* 自适应高度，避免消息被裁剪 */
    min-height: 45px;
}

.message.own-message {
    flex-direction: row-reverse;
}

.message-avatar {
    margin-right: 10px;
    width: 45px;
    height: 45px;
}

.message.own-message .message-avatar {
    margin-right: 0;
    margin-left: 10px;
}

.message-content {
    max-width: 60%;
}

.message.own-message .message-content {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
}

.message-bubble {
    background: white;
    border-radius: 18px;
    padding: 12px 16px;
    box-sizing: border-box;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
    position: relative;
    display: inline-block;
}

.message-bubble.has-status-icon {
    padding-right: 36px; /* 为右侧状态图标预留空间 */
}

.message.own-message .message-bubble {
    background: #eaf6ff;
    color: #1f2937;
}

.message-text {
    font-size: 14px;
    line-height: 1.4;
    word-wrap: break-word;
    word-break: break-word;
}

.message-time {
    font-size: 11px;
    color: #95a5a6;
    margin-top: 4px;
    margin-left: 16px;
}

.message.own-message .message-time {
    margin-left: 0;
    margin-right: 16px;
}

.input-area {
    border-top: 1px solid #e1e8ed;
    background: white;
    flex: 1 1 auto;
    /* 剩余空间 */
    min-height: 120px;
    position: relative;
    /* 作为表情面板定位参考 */
}

/* 发送中转圈图标 */
.message-bubble .spinner {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 2px solid transparent;
    border-top-color: #3498db;
    border-right-color: #3498db;
    position: absolute;
    right: 10px;
    top: 0;
    bottom: 0;
    margin: auto;
    flex-shrink: 0;
    animation: spin 0.8s linear infinite;
}

.message-bubble .status-icon {
    position: absolute;
    right: 10px;
    top: 0;
    bottom: 0;
    margin: auto;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 700;
}

.message-bubble .status-icon.error {
    background: #fdecea;
    color: #e74c3c;
    border: 1px solid #f5c6cb;
    cursor: pointer;
}

@keyframes spin {
    0% {
        transform: rotate(0deg);
    }

    100% {
        transform: rotate(360deg);
    }
}

.input-toolbar {
    padding: 10px 0px;
    border-bottom: 1px solid #f1f3f4;
    display: flex;
    gap: 10px;
}

.toolbar-btn {
    background: none;
    border: none;
    font-size: 18px;
    cursor: pointer;
    padding: 5px;
    border-radius: 4px;
    transition: background 0.2s;
}

.toolbar-btn:hover {
    background: #f8f9fa;
}

.input-container {
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    display: flex;
    gap: 10px;
    justify-content: center;
    align-items: center;
}

.message-input {
    position: relative;
    width: 100%;
    height: 100%;
    border: 1px solid #e1e8ed;
    padding-top: 5px;
    padding-left: 5px;
    resize: none;
    outline: none;
    font-size: 14px;
    font-family: inherit;
}

.message-input:focus {
    border-color: #3498db;
}

.send-btn {
    position: absolute;
    right: 20px;
    bottom: 20px;
    background: #3498db;
    color: white;
    border: none;
    border-radius: 20px;
    padding: 10px 20px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
    transition: background 0.2s;
}

.send-btn:hover:not(:disabled) {
    background: #2980b9;
}

.emoji-picker {
    position: absolute;
    left: 20px;
    bottom: calc(100% + 8px);
    /* 显示在输入区上方 */
    width: 280px;
    max-height: 240px;
    background: #fff;
    border: 1px solid #e1e8ed;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
    border-radius: 10px;
    overflow: hidden;
    z-index: 10;
}

.emoji-header {
    padding: 8px 12px;
    font-size: 12px;
    color: #6c757d;
    border-bottom: 1px solid #f1f3f4;
    background: #fafbfc;
}

.emoji-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 6px;
    padding: 10px;
    box-sizing: border-box;
    overflow: auto;
}

.emoji-item {
    background: none;
    border: none;
    font-size: 20px;
    cursor: pointer;
    line-height: 1;
    padding: 6px;
    border-radius: 6px;
}

.emoji-item:hover {
    background: #f5f7fa;
}

.send-btn:disabled {
    background: #bdc3c7;
    cursor: not-allowed;
}
</style>
