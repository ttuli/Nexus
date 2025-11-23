<template>
  <div class="main-interface">
    <!-- 左侧选择栏 -->
    <div class="sidebar">
      <div class="sidebar-header">
        <Avatar :source="userStore.avatar" @click="createWindow('userInfo')" />
      </div>

      <div class="sidebar-nav">
        <div class="nav-item" :class="{ active: activeTab === 'chat' }" @click="activeTab = 'chat'" title="聊天">
          <svg class="nav-icon" viewBox="0 0 24 24">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h4l4 4 4-4h4c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
          </svg>
        </div>

        <div class="nav-item" :class="{ active: activeTab === 'contacts' }" @click="activeTab = 'contacts'" title="联系人">
          <svg class="nav-icon" viewBox="0 0 24 24">
            <path
              d="M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.67 0-8 1.34-8 4v2h14v-2c0-2.66-5.33-4-8-4zm8 0c-.33 0-.68.02-1.03.06 2.52.38 5.03 1.47 5.03 3.94V19h6v-2c0-2.66-5.33-4-8-4z" />
          </svg>
          <span v-if="verifyUnreadCount > 0" class="nav-exclaim">!</span>
        </div>

        <div class="nav-item" :class="{ active: activeTab === 'settings' }" @click="activeTab = 'settings'" title="设置">
          <svg class="nav-icon" viewBox="0 0 24 24">
            <path
              d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.82,11.69,4.82,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z" />
          </svg>
        </div>
      </div>
    </div>

    <!-- 主内容区域 -->
    <div class="main-content">
      <!-- 聊天列表 -->
      <div class="chat-list" :style="{ width: chatListWidth + 'px' }">
        <div class="chat-list-header">
          <h3>{{ getTabTitle() }}</h3>
          <div class="header-actions">
            <button class="action-btn" @click="createWindow('addFriend')" title="添加">
              <svg viewBox="0 0 24 24">
                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
              </svg>
            </button>
          </div>
        </div>

        <div class="list-content">
          <!-- 聊天列表 -->
          <SidebarChat v-show="activeTab === 'chat'" />

          <!-- 联系人列表 -->
          <SidebarContact v-show="activeTab === 'contacts'" @verifyUnread="setVerifyUnread"
            @selectContact="() => { activeTab = 'chat' }" @verifyReadAll="clearVerifyUnread" />

          <!-- 设置选项 -->
          <SidebarSetting v-if="activeTab === 'settings'" @profile="openProfile"
            @notification="openNotificationSettings" @theme="openThemeSettings" @logout="logout" />
        </div>
      </div>

      <!-- 分割线 -->
      <div class="splitter" @mousedown="startResize" @dblclick="resetSplitter"></div>

      <!-- 聊天窗口 -->
      <div class="chat-window">
        <span></span>
        <div v-if="chatStore.uiMode === 'userInfo' && chatStore.userInfoId" class="user-info-panel">
          <div class="user-info-header">
            <button class="back-btn" @click="chatStore.showChat()">返回聊天</button>
          </div>
          <div class="user-info-card">
            <div class="avatar-wrap">
              <Avatar :source="relationStore.getUser(chatStore.userInfoId)?.avatar || ''" />
            </div>
            <div class="user-basic">
              <div class="name">{{ relationStore.getUser(chatStore.userInfoId)?.user_name || '未知' }}</div>
              <div class="uid">ID：{{ chatStore.userInfoId?.toString() }}</div>
              <div class="signature">{{ relationStore.getUser(chatStore.userInfoId)?.personal_signature || '' }}</div>
            </div>
            <div class="user-details">
              <div class="row"><span class="label">性别</span><span class="value">{{ (relationStore.getUser(chatStore.userInfoId)?.gender===1?'男':(relationStore.getUser(chatStore.userInfoId)?.gender===2?'女':'未知')) }}</span></div>
              <div class="row"><span class="label">手机号</span><span class="value">{{ relationStore.getUser(chatStore.userInfoId)?.phone || '' }}</span></div>
              <div class="row"><span class="label">加入类型</span><span class="value">{{ (relationStore.getUser(chatStore.userInfoId)?.join_type===1?'直接加入':'同意后加好友') }}</span></div>
            </div>
          </div>
        </div>
        <ChatArea v-else-if="chatStore.selectedChat" />
        <div v-else class="empty-chat">
          <div class="empty-icon">💬</div>
          <div class="empty-text">选择一个聊天开始对话</div>
        </div>
      </div>
    </div>
  </div>
  <TitleBar class="title-bar" :needMax="true" :onClose="closeLogic" />
</template>

<script lang="ts" setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { useUserStore } from '@/store/user';
import TitleBar from '@/components/TitleBar.vue';
import ChatArea from './ChatArea.vue'
import SidebarChat from './sidebar/Chat.vue'
import SidebarContact from './sidebar/Contact.vue'
import SidebarSetting from './sidebar/Setting.vue'
import { WebSocketCli } from '@/websocket'
import Avatar from '@/components/Avatar.vue'
import { getUserInfo } from '@/apis/user';
import { createWindow } from '@/utils/window';
import { useChatStore } from '@/store/chat';
import { sqlJsDB } from '@/utils/sqljs'
import { useRelationStore } from '@/store/relationMap'
import { ackOfflineMsg, getOfflineMsg } from '@/apis/social';


const userStore = useUserStore()
const chatStore = useChatStore()
const relationStore = useRelationStore()


// 响应式数据
const activeTab = ref<'chat' | 'contacts' | 'settings'>('chat')

const chatListWidth = ref(300)
const verifyUnreadCount = ref(0)

// 方法
const closeLogic = () => {
  window.ipcRenderer.send('window:hide')
}

const getTabTitle = () => {
  switch (activeTab.value) {
    case 'chat': return '聊天'
    case 'contacts': return '联系人'
    case 'settings': return '设置'
    default: return ''
  }
}

// 分割视图相关
let isResizing = false

const startResize = (event: MouseEvent) => {
  isResizing = true
  document.addEventListener('mousemove', handleResize)
  document.addEventListener('mouseup', stopResize)
  event.preventDefault()
}

const handleResize = (event: MouseEvent) => {
  if (!isResizing) return

  const mainContent = document.querySelector('.main-content') as HTMLElement
  if (!mainContent) return

  const rect = mainContent.getBoundingClientRect()
  const newWidth = event.clientX - rect.left

  if (newWidth >= 250 && newWidth <= 400) {
    chatListWidth.value = newWidth
  }
}

const stopResize = () => {
  isResizing = false
  document.removeEventListener('mousemove', handleResize)
  document.removeEventListener('mouseup', stopResize)
}

const resetSplitter = () => {
  chatListWidth.value = 300
}

const openProfile = () => {
  console.log('打开个人资料')
}

const openNotificationSettings = () => {
  console.log('打开通知设置')
}

const openThemeSettings = () => {
  console.log('打开主题设置')
}

const logout = () => {
  console.log('退出登录')
}

const setVerifyUnread = (count: number) => {
  verifyUnreadCount.value = count
}

const clearVerifyUnread = () => {
  verifyUnreadCount.value = 0
}

const onlineStatusChanged = async () => {
  if (navigator.onLine) {
    await initFunc()
    WebSocketCli.connect()
  } else {
    WebSocketCli.close()
  }
}

onMounted(async () => {
  window.addEventListener('online', onlineStatusChanged)
  window.addEventListener('offline', onlineStatusChanged)
  try {
    await initFunc()
  } catch (e) {
    console.log(e)
  }
  WebSocketCli.connect()
})
onUnmounted(() => {
  window.removeEventListener('online', onlineStatusChanged)
  window.removeEventListener('offline', onlineStatusChanged)
})
const initFunc = async () => {
  try {
    let res = await getUserInfo([])
    res = res.data
    if (Array.isArray(res.data) && res.data.length > 0) {
      userStore.setUserInfo({
        user_id: BigInt(res.data[0].user_id),
        avatar: res.data[0].avatar === '' || res.data[0].avatar === undefined ? '@/assets/default.png' : res.data[0].avatar,
        user_name: res.data[0].user_name,
        phone: res.data[0].phone,
        gender: res.data[0].gender,
        personal_signature: res.data[0].personal_signature,
        join_type: res.data[0].join_type,
      })
    }
    await sqlJsDB.init()
    relationStore.loadLocalCache()
    await chatStore.loadAllCaches()
    res = await getOfflineMsg({ limit: 0 })
    console.log(res)
    res = res.data
    if (Array.isArray(res.data)) {
      res.data.forEach((item) => {
        chatStore.parseWsMessage({
          id: item.id,
          timestamp: item.timestamp,
          content: item.content,
          session_id: item.session_id,
          status: item.status,
          msgType: item.type,
          sender_id: BigInt(item.sender_id),
          seq_id: item.seq_id,
        })
      })
    }
    if (res.data.length > 0)
      await ackOfflineMsg({ msgIds: res.data.map((item: any) => item.session_id + ':' + item.seq_id) })
  } catch (error) {
    console.log(error)
  }
}
</script>

<style scoped>
.title-bar {
  background-color: transparent;
}

.main-interface {
  display: flex;
  height: 100vh;
  background: #f5f5f5;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

/* 左侧选择栏 */
.sidebar {
  width: 60px;
  background: #2c3e50;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px 0;
  box-shadow: 2px 0 4px rgba(0, 0, 0, 0.1);
}

.sidebar-header {
  width: 50px;
  height: 50px;
  padding: 5px;
  margin-bottom: 20px;
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.nav-item {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  background: rgba(255, 255, 255, 0.1);
  -webkit-app-region: no-drag;
  position: relative;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.2);
}

.nav-item.active {
  background: #3498db;
}

.nav-icon {
  width: 20px;
  height: 20px;
  fill: white;
}

.nav-exclaim {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 16px;
  height: 16px;
  border-radius: 8px;
  background: #e74c3c;
  color: #fff;
  font-size: 12px;
  line-height: 16px;
  text-align: center;
  font-weight: 700;
}

/* 主内容区域 */
.main-content {
  flex: 1;
  display: flex;
  position: relative;
}

/* 聊天列表 */
.chat-list {
  background: white;
  border-right: 1px solid #e1e8ed;
  display: flex;
  flex-direction: column;
  min-width: 250px;
  max-width: 500px;
  -webkit-app-region: no-drag;
}

.chat-list-header {
  padding: 15px 20px;
  border-bottom: 1px solid #e1e8ed;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.chat-list-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #2c3e50;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.action-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: #f8f9fa;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.action-btn:hover {
  background: #e9ecef;
}

.action-btn svg {
  width: 16px;
  height: 16px;
  fill: #6c757d;
}


.list-content {
  flex: 1;
  overflow-y: auto;
}

/* 聊天项目 */
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
  margin-right: 12px;
}

.chat-avatar img {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  object-fit: cover;
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

/* 联系人和设置样式已迁移到各自组件 */

/* 分割线 */
.splitter {
  width: 4px;
  background: #e1e8ed;
  cursor: col-resize;
  transition: background 0.2s;
  -webkit-app-region: no-drag;
}

.splitter:hover {
  background: #3498db;
}

/* 聊天窗口 */
.chat-window {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;

  /* 允许内部 ChatArea 在纵向正确滚动，不撑破布局 */
  span {
    width: 100%;
    height: 30px;
    background: #fafbfc;
  }
}

.user-info-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 24px;
  -webkit-app-region: no-drag;
  background:
    radial-gradient(120px at 20% 30%, rgba(52,152,219,0.12), transparent 70%),
    radial-gradient(140px at 80% 20%, rgba(46,204,113,0.10), transparent 70%),
    radial-gradient(100px at 30% 80%, rgba(241,196,15,0.12), transparent 70%),
    #f8f9fa;
}
.user-info-header {
  display: flex;
  justify-content: flex-start;
  margin-bottom: 10px;
}
.back-btn {
  -webkit-app-region: no-drag;
  border: 1px solid #e1e8ed;
  background: #fff;
  color: #2c3e50;
  border-radius: 6px;
  padding: 6px 10px;
  cursor: pointer;
  transition: all .2s ease;
}
.back-btn:hover {
  background: #3498db;
  color: #fff;
  border-color: #3498db;
  box-shadow: 0 6px 16px rgba(52,152,219,0.25);
}
.user-info-card {
  display: flex;
  gap: 16px;
  padding: 18px;
  background: #fff;
  border: 1px solid #e9eef3;
  border-radius: 12px;
  box-shadow: 0 10px 24px rgba(0,0,0,0.08);
  transition: transform .2s ease, box-shadow .2s ease;
  align-items: center;
}
.user-info-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 14px 28px rgba(0,0,0,0.12);
}
.avatar-wrap {
  width: 92px;
  height: 92px;
  position: relative;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #eaf4ff, #ffffff);
}
.avatar-wrap::after {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  background: conic-gradient(from 0deg, #3498db, #2ecc71, #f1c40f, #e74c3c, #3498db);
  -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 6px), #000 0);
  animation: spinSlow 6s linear infinite;
}
.user-basic {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.user-basic .name {
  font-size: 20px;
  font-weight: 700;
  background: linear-gradient(135deg, #3498db 0%, #2ecc71 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
.user-basic .uid {
  margin-top: 4px;
  font-size: 13px;
  color: #95a5a6;
}
.user-basic .signature {
  margin-top: 6px;
  font-size: 13px;
  color: #6c757d;
}
.user-details {
  min-width: 220px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  justify-content: center;
}
.user-details .row {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #f8fbff;
  border: 1px solid #e9eef3;
  border-radius: 10px;
  /* text-align: center; */
  padding: 8px 10px;
}
.user-details .label {
  width: 90px;
  font-size: 13px;
  color: #6c757d;
  font-weight: 600;
  /* text-align: center; */
}
.user-details .value {
  font-size: 14px;
  color: #2c3e50;
  padding: 2px 8px;
  border-radius: 12px;
  background: #eef6ff;
  border: 1px solid #d7e8ff;
}
@keyframes spinSlow {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* 消息容器 */
.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  background: #f8f9fa;
}

.message {
  display: flex;
  margin-bottom: 20px;
  align-items: flex-start;
}

.message.own-message {
  flex-direction: row-reverse;
}

.message-avatar {
  margin-right: 10px;
}

.message.own-message .message-avatar {
  margin-right: 0;
  margin-left: 10px;
}

.message-avatar img {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
}

.message-content {
  max-width: 70%;
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
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  position: relative;
}

.message.own-message .message-bubble {
  background: #3498db;
  color: white;
}

.message-text {
  font-size: 14px;
  line-height: 1.4;
  word-wrap: break-word;
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

/* 输入区域 */
.input-area {
  border-top: 1px solid #e1e8ed;
  background: white;
}

.input-toolbar {
  padding: 10px 20px;
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
  padding: 15px 20px;
  display: flex;
  gap: 10px;
  align-items: flex-end;
}

.message-input {
  flex: 1;
  border: 1px solid #e1e8ed;
  border-radius: 20px;
  padding: 10px 15px;
  resize: none;
  outline: none;
  font-size: 14px;
  font-family: inherit;
  max-height: 100px;
  min-height: 40px;
}

.message-input:focus {
  border-color: #3498db;
}

.send-btn {
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

.send-btn:disabled {
  background: #bdc3c7;
  cursor: not-allowed;
}

/* 空聊天状态 */
.empty-chat {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #95a5a6;
  background: #fafbfc;
}

.empty-icon {
  font-size: 64px;
  margin-bottom: 20px;
}

.empty-text {
  font-size: 18px;
}

/* 滚动条样式 */
.list-content::-webkit-scrollbar,
.messages-container::-webkit-scrollbar {
  width: 6px;
}

.list-content::-webkit-scrollbar-track,
.messages-container::-webkit-scrollbar-track {
  background: #f1f1f1;
}

.list-content::-webkit-scrollbar-thumb,
.messages-container::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 3px;
}

.list-content::-webkit-scrollbar-thumb:hover,
.messages-container::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}
</style>
