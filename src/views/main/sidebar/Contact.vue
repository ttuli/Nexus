<template>
  <div class="contact-panel">
    <div class="segmented">
      <button :class="{ active: activeTab === 'friends' }" @click="activeTab = 'friends'">好友</button>
      <button :class="{ active: activeTab === 'groups' }" @click="activeTab = 'groups'">群聊</button>
      <button :class="{ active: activeTab === 'verify' }" @click="openVerifyTab">
        验证消息
        <span v-if="verifyUnread > 0" class="badge">{{ verifyUnread }}</span>
      </button>
    </div>

    <!-- 好友列表 -->
    <div v-if="activeTab === 'friends'" class="contact-items">
      <div v-for="contact in contactStore.Friends" :key="contact.user_id.toString()" class="contact-item"
        @click="selectContact('friend', contact)">
        <div class="contact-avatar">
          <Avatar :source="relationStore.getUser(contact.user_id)?.avatar || ''"
            :alt="relationStore.getUser(contact.user_id)?.user_name || ''" />
        </div>
        <div class="contact-info">
          <div class="contact-name">{{ relationStore.getUser(contact.user_id)?.user_name || contact.remark || '未知' }}
          </div>
          <span>{{ relationStore.getUser(contact.user_id)?.personal_signature || '' }}</span>
        </div>
      </div>
      <div v-if="!contactStore.Friends || contactStore.Friends.length === 0" class="empty">暂无好友</div>
    </div>

    <!-- 群聊列表（抽屉式） -->
    <div v-else-if="activeTab === 'groups'" class="contact-items">
      <!-- 我创建的 -->
      <div class="drawer">
        <div class="drawer-header" @click="toggleOwned">
          <span>我创建的</span>
          <span class="count">{{ ownedGroups.length }}</span>
          <span class="chevron" :class="{ open: showOwned }">⌄</span>
        </div>
        <div class="drawer-content" v-show="showOwned">
          <div v-for="group in ownedGroups" :key="group.id.toString()" class="contact-item"
            @click="selectContact('group', group)">
            <div class="contact-avatar">
              <Avatar :source="group.avatar || ''" :alt="group.name" type="group"/>
            </div>
            <div class="contact-info">
              <div class="contact-name">
                {{ group.name }}
                <span class="owner-badge">我的群</span>
              </div>
            </div>
          </div>
          <div v-if="ownedGroups.length === 0" class="empty">暂无我创建的群</div>
        </div>
      </div>

      <!-- 我加入的 -->
      <div class="drawer">
        <div class="drawer-header" @click="toggleJoined">
          <span>我加入的</span>
          <span class="count">{{ joinedGroups.length }}</span>
          <span class="chevron" :class="{ open: showJoined }">⌄</span>
        </div>
        <div class="drawer-content" v-show="showJoined">
          <div v-for="group in joinedGroups" :key="group.id.toString()" class="contact-item"
            @click="selectContact('group', group)">
            <div class="contact-avatar">
              <Avatar :source="group.avatar || ''" :alt="group.name" type="group"/>
            </div>
            <div class="contact-info">
              <div class="contact-name">{{ group.name }}</div>
            </div>
          </div>
          <div v-if="joinedGroups.length === 0" class="empty">暂无我加入的群</div>
        </div>
      </div>
    </div>

    <!-- 验证消息（ApplyInfo 展示：头像、名字、性别、留言、状态） -->
    <div v-show="activeTab === 'verify'" class="verify-items">
      <div class="sub-segmented">
        <button :class="{ active: verifyTab === 'friend' }" @click="openFriendVerifyTab">
          好友验证
          <span v-if="verifyUnreadFriendCount > 0" class="badge">{{ verifyUnreadFriendCount }}</span>
        </button>
        <button :class="{ active: verifyTab === 'group' }" @click="openGroupVerifyTab">
          群聊验证
          <span v-if="verifyUnreadGroupCount > 0" class="badge">{{ verifyUnreadGroupCount }}</span>
        </button>
      </div>
      <div v-show="verifyTab === 'friend'">
        <div v-for="v in friendVerifications" :key="v.apply_id" class="verify-item">
          <div class="verify-avatar">
            <Avatar :source="relationStore.getUser(v.user_id)?.avatar || ''"
              :alt="relationStore.getUser(v.user_id)?.user_name || ''" @click="showUserInfo(v.user_id)" />
          </div>
          <div class="verify-info">
            <div class="verify-name">
              {{ relationStore.getUser(v.user_id)?.user_name }}
            </div>
            <div class="verify-note" v-if="v.message">{{ v.message }}</div>
            <div class="verify-time" v-if="v.time">{{ formatTime(Number(v.time)) }}</div>
          </div>
          <div class="verify-right">
            <div class="processing" v-if="v.pending">
              <span class="spinner" aria-hidden="true"></span>
              <span class="processing-text">处理中...</span>
            </div>
            <div class="act-btn"
              v-else-if="v.sender_id.toString() !== userStore.userId && v.status === ApplyStatus.Pending">
              <button class="btn primary" @click="handleFApply(v, ApplyStatus.Accepted)"
                :disabled="v.pending">同意</button>
              <button class="btn danger" @click="handleFApply(v, ApplyStatus.Rejected)"
                :disabled="v.pending">拒绝</button>
            </div>
            <span class="status-pill" v-else :class="statusClass(v.status)">{{ statusText(v.status) }}</span>
          </div>
        </div>
        <div v-if="friendVerifications.length === 0" class="empty">暂无好友验证消息</div>
      </div>
      <div v-show="verifyTab === 'group'">
        <div v-for="v in groupVerifications" :key="v.request_id" class="verify-item">
          <div class="verify-avatar">
            <Avatar :source="(relationStore.getUser(v.sender_id)?.avatar) || ''" />
          </div>
          <div class="verify-info">
            <div class="verify-name">
              <span v-if="v.sender_id.toString() !== userStore.userId">{{ relationStore.getUser(v.sender_id)?.user_name
                ||
                '未知' }} 申请加入 </span>{{ relationStore.getGroup(v.group_id)?.name || '群聊' }}
            </div>
            <div class="verify-note" v-if="v.message">{{ v.message }}</div>
            <div class="verify-time" v-if="v.request_time">{{ formatTime(Number(v.request_time)) }}</div>
          </div>
          <div class="verify-right">
            <div class="act-btn" v-if="v.sender_id.toString() !== userStore.userId && v.status === ApplyStatus.Pending">
              <button class="btn primary" @click="handleGApply(v, ApplyStatus.Accepted)"
                :disabled="v.pending">同意</button>
              <button class="btn danger" @click="handleGApply(v, ApplyStatus.Rejected)"
                :disabled="v.pending">拒绝</button>
            </div>
            <span class="status-pill" :class="statusClass(v.status)" v-else>{{ statusText(v.status) }}</span>
          </div>
        </div>
        <div v-if="groupVerifications.length === 0" class="empty">暂无群聊验证消息</div>
      </div>
    </div>
  </div>

</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import Avatar from '@/components/Avatar.vue'
import { useUserStore } from '@/store/user'
import { getApply, getContactList, handleFriendApply, handleGroupApply } from '@/apis/social'
import { useApplyStore } from '@/store/apply'
import { useRelationStore } from '@/store/relationMap'
import { useContactStore } from '@/store/contact'
import { useChatStore } from '@/store/chat'
import { ApplyStatus } from '@/models/social'
import { ElMessage } from 'element-plus'
import { GroupInfo } from '@/models/group'
import { WebSocketCli } from '@/websocket'
import { ApplyMsg, MsgType } from '@/models/message'

const userStore = useUserStore()
const applyInfoStore = useApplyStore()
const relationStore = useRelationStore()
const contactStore = useContactStore()
const chatStore = useChatStore()

const showOwned = ref(true)
const showJoined = ref(true)
const ownedGroups = computed(() => {
  let result = [] as GroupInfo[]
  contactStore.Groups.forEach(g => {
    if (relationStore.getGroup(g)?.owner_id === userStore.userInfo.user_id)
      result.push(relationStore.getGroup(g) as GroupInfo)
  })
  return result
})
const joinedGroups = computed(() => {
  let result = [] as GroupInfo[]
  contactStore.Groups.forEach(g => {
    if (relationStore.getGroup(g)?.owner_id !== userStore.userInfo.user_id) {
      result.push(relationStore.getGroup(g) as GroupInfo)
    }
  })
  return result
})
const toggleOwned = () => { showOwned.value = !showOwned.value }
const toggleJoined = () => { showJoined.value = !showJoined.value }

const emit = defineEmits<{
  (e: 'selectContact'): void
  (e: 'verifyUnread', count: number): void
  (e: 'verifyReadAll'): void
}>()

const selectContact = (type:string,contact: any) => {
  if (type === 'friend') {
    chatStore.setActiveChat(contact.user_id,type)
  } else {
    chatStore.setActiveChat(contact.id,type)
  }
  emit('selectContact')
}

const activeTab = ref<'friends' | 'groups' | 'verify'>('friends')
const verifyTab = ref<'friend' | 'group'>('friend')


const statusText = (status?: number) => {
  switch (status) {
    case 1: return '待处理'
    case 2: return '已同意'
    case 3: return '已拒绝'
    case 4: return '已过期'
    default: return '未知'
  }
}

const statusClass = (status?: number) => {
  switch (status) {
    case 1: return 'pending'
    case 2: return 'accepted'
    case 3: return 'rejected'
    case 4: return 'expired'
    default: return 'unknown'
  }
}
const friendCleared = ref(false)
const groupCleared = ref(false)
const friendClearedBaseline = ref(0)
const groupClearedBaseline = ref(0)

const friendPendingCount = computed(() => {
  let count = 0
  const size = applyInfoStore.FriendApplyMap.size
  applyInfoStore.FriendApplyMap.forEach(item => {
    if (item.status === ApplyStatus.Pending && item.sender_id.toString() !== userStore.userId) {
      count += 1
    }
  })
  return count
})

const groupPendingCount = computed(() => {
  let count = 0
  const size = applyInfoStore.GrooupApplyMap.size
  applyInfoStore.GrooupApplyMap.forEach(item => {
    if (item.status === ApplyStatus.Pending && item.sender_id.toString() !== userStore.userId) {
      count += 1
    }
  })
  return count
})

const verifyUnreadFriendCount = computed(() => friendCleared.value ? 0 : friendPendingCount.value)
const verifyUnreadGroupCount = computed(() => groupCleared.value ? 0 : groupPendingCount.value)

const verifyUnread = computed(() => {
  return verifyUnreadFriendCount.value + verifyUnreadGroupCount.value
})

const friendVerifications = computed(() => {
  const size = applyInfoStore.FriendApplyMap.size
  return Array.from(applyInfoStore.FriendApplyMap.values()).map(item => ({ ...item, pending: false }))
})

const groupVerifications = computed(() => {
  const size = applyInfoStore.GrooupApplyMap.size
  return Array.from(applyInfoStore.GrooupApplyMap.values()).map(item => ({ ...item, pending: false }))
})

watch(verifyUnread, (val) => {
  if (val > 0) {
    emit('verifyUnread', val)
  } else {
    emit('verifyReadAll')
  }
})

const openVerifyTab = () => {
  activeTab.value = 'verify'
}

const openFriendVerifyTab = () => {
  verifyTab.value = 'friend'
  friendCleared.value = true
  friendClearedBaseline.value = friendPendingCount.value
}

const openGroupVerifyTab = () => {
  verifyTab.value = 'group'
  groupCleared.value = true
  groupClearedBaseline.value = groupPendingCount.value
}

watch(friendPendingCount, (count) => {
  if (count > friendClearedBaseline.value) {
    friendCleared.value = false
    friendClearedBaseline.value = count
  }
})

watch(groupPendingCount, (count) => {
  if (count > groupClearedBaseline.value) {
    groupCleared.value = false
    groupClearedBaseline.value = count
  }
})

const formatTime = (ts: number) => {
  try {
    return new Date(ts).toLocaleString('zh-CN', { hour12: false })
  } catch (err) {
    console.log(err)
    return ''
  }
}

const handleFApply = async (apply: any, status: ApplyStatus) => {
  apply.pending = true
  try {
    await handleFriendApply({
      applyId: apply.apply_id,
      result: status,
      msg: ''
    })
    const applymsg:ApplyMsg = {
      apply_id: apply.apply_id,
      relation_id: userStore.userInfo.user_id.toString(),
      status: status,
      reason: '',
      message:'',
      update_at: Date.now(),
      type:'friend',
    }
    WebSocketCli.SendMessage({
      id:'',
      msgType:MsgType.ApplyUpdate,
      sender_id: userStore.userInfo.user_id,
      receivers: [BigInt(apply.sender_id)],
      timestamp: Date.now(),
      content:'',
      extra:{
        apply:applymsg
      }
    })  
    apply.status = status
    const a = applyInfoStore.FriendApplyMap.get(apply.user_id)
    if (a) a.status = status
    if (status == ApplyStatus.Accepted) {
      contactStore.setFriend({
        user_id: BigInt(apply.user_id),
        remark: '',
      })
    }
    ElMessage.success("处理成功")
  } finally {
    apply.pending = false
  }
}

const showUserInfo = (userId: bigint) => {
  if (chatStore.uiMode === 'userInfo' && chatStore.userInfoId === userId) return
  chatStore.showUserInfo(userId)
}

const handleGApply = async (apply: any, status: ApplyStatus) => {
  apply.pending = true
  try {
    await handleGroupApply({
      applyId: apply.request_id,
      result: status,
      msg: ''
    })
    apply.status = status
    const applymsg:ApplyMsg = {
      apply_id: apply.apply_id,
      relation_id: BigInt(apply.group_id).toString(),
      status: status,
      reason: '',
      message:"",
      update_at: Date.now(),
      type:'group',
    }
    WebSocketCli.SendMessage({
      id:'',
      msgType:MsgType.ApplyUpdate,
      sender_id: userStore.userInfo.user_id,
      receivers: [BigInt(apply.sender_id)],
      timestamp: Date.now(),
      content:'',
      extra:{
        apply:applymsg
      }
    })  
    const a = applyInfoStore.GrooupApplyMap.get(apply.group_id)
    if (a) a.status = status
    ElMessage.success("处理成功")
  } catch(err){
    console.log(err)
    ElMessage.error("处理失败")
  }finally {
    apply.pending = false
  } 
}

onMounted(async () => {
  let res = await getApply()
  const data = res.data.data
  let friendData = data.friend
  let groupData = data.group
  if (Array.isArray(friendData)) {
    friendData.forEach(item => {
      applyInfoStore.setFriendApply({
        apply_id: item.request_id,
        user_id: BigInt(item.user_id),
        sender_id: BigInt(item.sender_id),
        status: item.status,
        message: item.message,
        time: item.request_time,
      })
    })
  }
  if (Array.isArray(groupData)) {
    groupData.forEach(item => {
      applyInfoStore.setGroupApply({
        request_id: item.request_id,
        group_id: BigInt(item.group_id),
        sender_id: BigInt(item.sender_id),
        status: item.status,
        message: item.message,
        request_time: item.request_time,
      })
    })
  }

  res = await getContactList()
  const d = res.data.data
  friendData = d.friend
  groupData = d.group
  if (Array.isArray(friendData)) {
    friendData.forEach(item => {
      contactStore.setFriend({
        user_id: BigInt(item.friend_user_id),
        remark: item.remark,
      })
    })
  }
  if (Array.isArray(groupData)) {
    groupData.forEach(item => {
      contactStore.Groups.push(BigInt(item.id))
      relationStore.setGroup({
        id: BigInt(item.id),
        name: item.name,
        avatar: item.avatar,
        owner_id: BigInt(item.owner_id),
        created_at: item.created_at,
        updated_at: item.updated_at,
        members: item.members.map((m:any) => ({
          group_id: BigInt(m.group_id),
          user_id: BigInt(m.user_id),
          role: m.role,
          nickname: m.nickname,
          joined_at: m.joined_at,
        }))
      })
    })
  }
})
</script>

<style scoped>
.contact-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.segmented {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid #e1e8ed;
}

.segmented button {
  flex: 0 0 auto;
  background: #f4f5f7;
  border: 1px solid #e1e8ed;
  border-radius: 20px;
  padding: 6px 14px;
  cursor: pointer;
  color: #2c3e50;
  -webkit-app-region: no-drag;
}

.segmented button.active {
  background: #3498db;
  color: #fff;
  border-color: #3498db;
}

.badge {
  display: inline-block;
  min-width: 18px;
  padding: 0 6px;
  margin-left: 6px;
  font-size: 12px;
  line-height: 18px;
  border-radius: 9px;
  background: #e74c3c;
  color: #fff;
}

.contact-items {
  display: flex;
  flex-direction: column;
}

.drawer {
  border-bottom: 1px solid #e1e8ed;
}

.drawer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  cursor: pointer;
  background: #f8f9fa;
}

.drawer-header .count {
  font-size: 12px;
  color: #6c757d;
  margin-left: auto;
  margin-right: 8px;
}

.drawer-header .chevron {
  transition: transform 0.2s ease;
  color: #6c757d;
}

.drawer-header .chevron.open {
  transform: rotate(180deg);
}

.drawer-content {
  display: flex;
  flex-direction: column;
}

.contact-item {
  display: flex;
  align-items: center;
  padding: 12px 20px;
  cursor: pointer;
  transition: background 0.2s;
  border-bottom: 1px solid #f1f3f4;
}

.contact-item:hover {
  background: #f8f9fa;
}

.contact-avatar {
  width: 50px;
  height: 50px;
  position: relative;
  margin-right: 12px;
}

.status-indicator.online {
  background: #27ae60;
}

.status-indicator.away {
  background: #f39c12;
}

.status-indicator.offline {
  background: #95a5a6;
}

.contact-info {
  flex: 1;

  span {
    color: #6c757d;
    font-size: 13px;
  }
}

.contact-name {
  font-weight: 600;
  font-size: 14px;
  color: #2c3e50;
  margin-bottom: 4px;
}

.owner-badge {
  margin-left: 8px;
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 10px;
  background: #e8f6ef;
  color: #27ae60;
  border: 1px solid #cdebd8;
}

.empty {
  text-align: center;
  color: #95a5a6;
  font-size: 13px;
  padding: 12px 0;
}

.verify-items {
  display: flex;
  flex-direction: column;
}

.sub-segmented {
  display: flex;
  gap: 8px;
  padding: 8px 16px 0 16px;
}

.sub-segmented button {
  flex: 0 0 auto;
  background: #f4f5f7;
  border: 1px solid #e1e8ed;
  border-radius: 14px;
  padding: 4px 10px;
  cursor: pointer;
  color: #2c3e50;
}

.sub-segmented button.active {
  background: #3498db;
  color: #fff;
  border-color: #3498db;
}

.verify-item {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding: 12px 16px;
  border-bottom: 1px solid #f1f3f4;

  &:hover {
    background: #f8f9fa;
  }
}

.verify-avatar {
  width: 42px;
  height: 42px;
  margin-right: 12px;
}

.verify-info {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.verify-name {
  font-weight: 600;
  color: #2c3e50;
}

.gender {
  margin-left: 8px;
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 10px;
  background: #ecf0f1;
  color: #7f8c8d;
}

.gender.male {
  background: #e8f4fd;
  color: #2980b9;
}

.gender.female {
  background: #fde8f2;
  color: #c0392b;
}

.gender.unknown {
  background: #f0f3f4;
  color: #7f8c8d;
}

.type-badge {
  margin-left: 8px;
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 10px;
  border: 1px solid #e1e8ed;
}

.type-badge.friend {
  background: #e8f6ef;
  color: #27ae60;
  border-color: #cdebd8;
}

.type-badge.group {
  background: #e8f4fd;
  color: #2980b9;
  border-color: #cfe6fb;
}

.verify-note {
  font-size: 13px;
  color: #6c757d;
}

.verify-time {
  font-size: 12px;
  color: #95a5a6;
}

.verify-actions {
  display: flex;
  gap: 8px;
}

.btn {
  border: 1px solid #e1e8ed;
  border-radius: 6px;
  padding: 6px 12px;
  cursor: pointer;
}

.btn.accept {
  background: #e8f6ef;
  color: #27ae60;
  border-color: #cdebd8;
}

.btn.decline {
  background: #fff4e6;
  color: #f39c12;
  border-color: #f7d9a6;
}

.verify-right {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: 12px;

  .processing {
    display: flex;
    align-items: center;
    gap: 8px;

    .spinner {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      border: 2px solid transparent;
      border-top-color: #3498db;
      border-right-color: #3498db;
      animation: spin 0.8s linear infinite;
    }

    .processing-text {
      font-size: 12px;
      color: #3498db;
    }
  }

  .act-btn {
    display: flex;
    gap: 10px;

    .btn {
      border: 1px solid #e1e8ed;
      border-radius: 6px;
      padding: 6px 12px;
      cursor: pointer;
      transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;

      &.primary {
        background: #e8f6ef;
        color: #27ae60;
        border-color: #cdebd8;

        &:hover {
          background: #d9f1e5;
        }

        &:active {
          background: #cbe9d8;
        }
      }

      &.danger {
        background: #fdecea;
        color: #e74c3c;
        border-color: #f5c6cb;

        &:hover {
          background: #fbdedb;
        }

        &:active {
          background: #f7cfcb;
        }
      }
    }
  }
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(360deg);
  }
}

.status-pill {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 12px;
  border: 1px solid #e1e8ed;
}

.status-pill.pending {
  background: #fffbea;
  color: #f39c12;
  border-color: #f7d9a6;
}

.status-pill.accepted {
  background: #e8f6ef;
  color: #27ae60;
  border-color: #cdebd8;
}

.status-pill.rejected {
  background: #fdecea;
  color: #e74c3c;
  border-color: #f5c6cb;
}

.status-pill.expired {
  background: #f4f6f7;
  color: #95a5a6;
  border-color: #e1e8ed;
}
</style>
