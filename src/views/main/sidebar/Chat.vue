<template>
  <div class="chat-items">
    <div v-for="chat in chatStore.chats" :key="chat.id.toString()" class="chat-item" :class="{ active: chatStore.selectedChat?.id?.toString() === chat.id.toString() }"
      @click="clickChat(chat)">
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
  chatStore.selectedChat = c
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
</style>