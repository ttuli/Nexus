<template>
  <div class="chat-items" @scroll="closeMenu">
    <div v-for="chat in chatStore.chats" :key="chat.id.toString()" class="chat-item" :class="{ active: chatStore.selectedChat?.id?.toString() === chat.id.toString() }"
      @click="clickChat(chat)" @contextmenu.prevent="openMenu(chat, $event)">
      <div class="chat-avatar">
        <Avatar :source="chat.type==='friend'?relationStore.getUser(chat.id)?.avatar:relationStore.getGroup(chat.id)?.avatar" class="avatar-img" />
        <div v-if="chat.unreadCount > 0" class="unread-badge">
          {{ chat.unreadCount > 99 ? '99+' : chat.unreadCount }}
        </div>
      </div>
      <div class="chat-info">
        <div class="chat-name">{{ chat.type==='friend'?relationStore.getUser(chat.id)?.user_name:relationStore.getGroup(chat.id)?.name }}</div>
        <div class="chat-last-message">{{ chat.lastMessage }}</div>
      </div>
      <div class="chat-meta">
        <div class="chat-time">{{ formatTime(chat.lastMessageTime - now + now) }}</div>
      </div>
    </div>
    <div v-if="menuVisible" class="context-menu" :style="{ left: menuX + 'px', top: menuY + 'px' }" @click.stop>
      <button class="menu-item" @click="onMarkRead">设为已读</button>
      <button class="menu-item" @click="onPinTop">移动到最上层</button>
      <div class="menu-divider"></div>
      <button class="menu-item danger" @click="onRemove">移除会话</button>
    </div>
    <div v-if="menuVisible" class="menu-overlay" @click="closeMenu"></div>
  </div>
</template>

<script setup lang="ts">
import { onMounted,onUnmounted,ref } from 'vue'
import { useChatStore } from '@/store/chat'
import { useRelationStore } from '@/store/relationMap'
import Avatar from '@/components/Avatar.vue'
import { ChatListInfo } from '@/models/chat'

const chatStore = useChatStore()
const relationStore = useRelationStore()

const now = ref(Date.now())
let timer: number

const clickChat = (c:ChatListInfo) => {
  c.unreadCount = 0
  chatStore.setActiveChat(c.id,c.type)
}

const menuVisible = ref(false)
const menuX = ref(0)
const menuY = ref(0)
const menuChat = ref<ChatListInfo | null>(null)

const openMenu = (chat: ChatListInfo, e: MouseEvent) => {
  menuChat.value = chat
  const vw = window.innerWidth
  const vh = window.innerHeight
  const menuW = 180
  const menuH = 140
  let x = e.clientX
  let y = e.clientY
  if (x + menuW > vw) x = Math.max(0, vw - menuW - 8)
  if (y + menuH > vh) y = Math.max(0, vh - menuH - 8)
  menuX.value = x
  menuY.value = y
  menuVisible.value = true
}

const closeMenu = () => {
  menuVisible.value = false
  menuChat.value = null
}

const onMarkRead = () => {
  if (!menuChat.value) return
  chatStore.markChatAsRead(menuChat.value.id)
  closeMenu()
}

const onPinTop = () => {
  if (!menuChat.value) return
  chatStore.bumpChatToTop(menuChat.value.id)
  closeMenu()
}

const onRemove = () => {
  if (!menuChat.value) return
  chatStore.removeChat(menuChat.value.id)
  closeMenu()
}

const formatTime = (dateLike: Date | number) => {
  if (!dateLike) return ''
  const date = typeof dateLike === 'number' ? new Date(dateLike) : dateLike
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  if (diff < 1000 * 60) return '刚刚'
  if (diff < 1000 * 60 * 60) return `${Math.floor(diff / (1000 * 60))}分钟前`
  if (diff < 1000 * 60 * 60 * 24) return `${Math.floor(diff / (1000 * 60 * 60))}小时前`
  return date.toLocaleDateString()
}

onMounted(() => {
  timer = window.setInterval(() => {
    now.value = Date.now()
  }, 60 * 1000)
})
onUnmounted(() => {
  clearInterval(timer)
})
</script>

<style lang="scss" scoped>
.chat-items {
  display: flex;
  flex-direction: column;
}

.chat-item {
  display: flex;
  align-items: center;
  padding: 12px 20px;
  cursor: pointer;
  transition: background 0.2s;
  border-bottom: 1px solid #f1f3f4;
}

.chat-item:hover {
  background: #f8f9fa;
}

.chat-item.active {
  background: #e3f2fd;
  border-right: 3px solid #3498db;
}

.chat-avatar {
  position: relative;
  width: 48px;
  height: 48px;
  margin-right: 12px;
  display: flex;
  justify-content: center;
  align-items: center;

  .avatar-img {
    // background-color: #068bea;
    width: 100%;
    height: 100%;
  }
}

.unread-badge {
  position: absolute;
  top: -5px;
  right: -5px;
  background: #e74c3c;
  color: white;
  border-radius: 10px;
  padding: 2px 6px;
  font-size: 12px;
  min-width: 18px;
  text-align: center;
}

.chat-info {
  flex: 1;
  min-width: 0;
}

.chat-name {
  font-weight: 600;
  font-size: 14px;
  color: #2c3e50;
  margin-bottom: 4px;
}

.chat-last-message {
  font-size: 13px;
  color: #6c757d;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-meta {
  text-align: right;
}

.chat-time {
  font-size: 12px;
  color: #95a5a6;
}

.context-menu {
  position: fixed;
  z-index: 1000;
  width: 180px;
  background: #fff;
  border: 1px solid #e1e8ed;
  border-radius: 8px;
  box-shadow: 0 6px 20px rgba(0,0,0,0.12);
  padding: 6px;
}
.menu-item {
  width: 100%;
  text-align: left;
  padding: 8px 10px;
  border: none;
  background: transparent;
  color: #2c3e50;
  cursor: pointer;
  border-radius: 6px;
}
.menu-item:hover {
  background: #f5f8fb;
}
.menu-item.danger {
  color: #e74c3c;
}
.menu-divider {
  height: 1px;
  margin: 6px 0;
  background: #eef3f7;
}
.menu-overlay {
  position: fixed;
  inset: 0;
  z-index: 999;
  background: transparent;
}
</style>
