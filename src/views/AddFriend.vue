<template>
    <div class="overlay">
        <div class="dialog qq-style">
            <div class="dialog-header">
                <div class="title">添加好友 / 群组</div>
            </div>

            <div class="segmented">
                <button :class="{ active: activeTab === 'friend' }" @click="activeTab = 'friend'">添加好友</button>
                <button :class="{ active: activeTab === 'group' }" @click="activeTab = 'group'">添加群组</button>
            </div>

            <div class="content">
                <!-- 添加好友 -->
                <div v-if="activeTab === 'friend'" class="tab-panel">
                    <div class="search-input">
                        <svg viewBox="0 0 24 24" class="icon">
                            <path
                                d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zM9.5 14C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                        </svg>
                        <input v-model="searchFriend" type="text" placeholder="搜索用户 ID、手机号或昵称"
                            @keyup.enter="commitFriendSearch" />
                    </div>

                    <div class="result-list">
                        <div v-for="u in filteredUsers" :key="String(u.user_id) || u.phone" class="result-item">
                            <div class="avatar-wrap">
                                <Avatar :source="u.avatar" />
                            </div>
                            <div class="info">
                                <div class="line1">
                                    <span class="name">{{ u.user_name }}</span>
                                    <span class="uid">ID: {{ u.user_id }}</span>

                                </div>
                                <div class="line2" v-if="u.personal_signature" :title="u.personal_signature">{{
                                    u.personal_signature }}</div>
                            </div>
                            <div class="actions">
                                <span v-if="getState(u)" class="result-state" :class="getState(u)">{{
                                    stateLabel(getState(u)) }}</span>
                                <button v-else class="primary" @click="onAddFriendClick(u)">添加</button>
                            </div>
                        </div>
                        <div v-if="filteredUsers.length === 0" class="empty">未找到匹配的用户</div>
                    </div>

                </div>

                <!-- 添加群组 -->
                <div v-else class="tab-panel">
                    <div class="search-input">
                        <svg viewBox="0 0 24 24" class="icon">
                            <path
                                d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zM9.5 14C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                        </svg>
                        <input v-model="searchGroup" type="text" placeholder="搜索群 ID 或名称"
                            @keyup.enter="commitGroupSearch" />
                    </div>

                    <div class="result-list">
                        <div v-for="g in filteredGroups" :key="g.id.toString()" class="result-item">
                            <div class="group-avatar">
                                <Avatar :source="g.avatar" />
                            </div>
                            <div class="info">
                                <div class="line1">
                                    <span class="name">{{ g.name }}</span>
                                    <span class="uid">ID: {{ g.id }}</span>
                                    <span class="members">成员: {{ Array.isArray(g.members) ? g.members.length : 0
                                    }}</span>
                                </div>
                            </div>
                            <div class="actions">
                                <div class="joined" v-if="getGroupStatus(g) === 'joined'">已加入</div>
                                <div class="pending" v-else-if="getGroupStatus(g) === 'pending'">申请中</div>
                                <button class="primary" @click="onJoinGroupClick(g)" v-else>申请加入</button>
                            </div>
                        </div>
                        <div v-if="filteredGroups.length === 0" class="empty">暂无匹配的群组</div>
                    </div>

                    <div class="divider">或</div>
                    <div class="form-row">
                        <label>群名称</label>
                        <input v-model="groupName" type="text" placeholder="例如：项目讨论组" />
                    </div>
                    <div class="actions">
                        <button class="primary" :disabled="!groupName.trim()" @click="onCreateGroup">创建群</button>
                    </div>
                </div>
            </div>
        </div>

        <!-- 验证消息弹窗（点击“添加”后显示） -->
        <div v-if="verifyModalOpen" class="verify-modal-overlay">
            <div class="verify-modal">
                <div class="modal-header">
                    <div class="title">发送验证消息</div>
                    <button class="close-btn" title="关闭" @click="closeVerifyModal">✕</button>
                </div>
                <div class="target-info" v-if="selectedUser">
                    <Avatar :source="selectedUser.avatar" class="avatar"></Avatar>
                    <div class="info">
                        <div class="name">{{ selectedUser.user_name }}</div>
                        <div class="uid">ID: {{ selectedUser.user_id }}</div>
                        <div class="line2" v-if="selectedUser.personal_signature">{{ selectedUser.personal_signature }}
                        </div>
                    </div>
                </div>
                <div class="target-info" v-else-if="selectedGroup">
                    <Avatar :source="selectedGroup.avatar || ''" class="avatar"></Avatar>
                    <div class="info">
                        <div class="name">{{ selectedGroup.name }}</div>
                        <div class="uid">ID: {{ selectedGroup.id }}</div>
                        <div class="line2" v-if="selectedGroup.owner_id">群主 ID: {{ selectedGroup.owner_id }}</div>
                    </div>
                </div>

                <div class="form-row">
                    <div class="label-row">
                        <label>验证信息</label>
                        <span class="char-count">{{ verifyMessage.length }}/50</span>
                    </div>
                    <div class="input-row">
                        <textarea v-model="verifyMessage" maxlength="50" placeholder="附加消息，帮助对方确认你的身份"></textarea>
                    </div>
                </div>

                <div class="modal-actions">
                    <button class="btn cancel" @click="closeVerifyModal">取消</button>
                    <button class="btn send" @click="confirmSend"
                        :disabled="!selectedUser && !selectedGroup">发送</button>
                </div>

                <div v-if="errorActive" class="error-tip">请检查信息或重新选择对象</div>
            </div>
        </div>
    </div>
    <TitleBar></TitleBar>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { getUserInfo, getUserInfoByName, getUserInfoByPhone } from '@/apis/user'
import { newFriendApply, createGroup, getGroupList, joinGroup } from '@/apis/social'
import TitleBar from '@/components/TitleBar.vue'
import { useUserStore } from '@/store/user'
import { ElLoading, ElMessage } from 'element-plus'
import { useContactStore } from '@/store/contact'
import Avatar from '@/components/Avatar.vue'
import { useRelationStore } from '@/store/relationMap'
import { UserInfo } from '@/models/user'
import { GroupInfo } from '@/models/group'
import { useApplyStore } from '@/store/apply'
import { WebSocketCli } from '@/websocket'
import { ApplyMsg, MsgType } from '@/models/message'

const applyStore = useApplyStore()
const userStore = useUserStore()
const contactStore = useContactStore()
const relationStore = useRelationStore()

const activeTab = ref<'friend' | 'group'>('friend')

// 好友搜索与示例数据
const searchFriend = ref('')
const verifyMessage = ref('')
let filteredUsers = reactive<UserInfo[]>([])

const getState = (u: UserInfo) => {
    if (userStore.userInfo && u.user_id === userStore.userInfo.user_id)
        return 'self'
    let a = applyStore.FriendApplyMap.get(applyStore.FriendIDMap.get(BigInt(u.user_id)) || '')
    if (a !== undefined) {
        if (a.status === 1)
            return 'pending';
        else if (a.status === 2)
            return 'added'
    }
    return ''
}
const stateLabel = (s?: 'added' | 'self' | '' | 'pending') => {
    switch (s) {
        case 'added':
            return '已添加'
        case 'self':
            return '我'
        case 'pending':
            return '待确认'
        default:
            return ''
    }
}

// 群组搜索与示例数据
const searchGroup = ref('')
let filteredGroups = reactive<GroupInfo[]>([])

const getGroupStatus = (g: GroupInfo) => {
    if (contactStore.HasGroup(g.id))
        return 'joined'
    let a = applyStore.GrooupApplyMap.get(applyStore.GroupIDMap.get(BigInt(g.id)) || '')
    if (a !== undefined) {
        if (a.status === 1)
            return 'pending';
        else if (a.status === 2)
            return 'added'
    }
    return ''
}

// 搜索节流与重复内容判断
const MIN_FRIEND_SEARCH_INTERVAL = 800 // 毫秒
const lastFriendQuery = ref('')
const lastFriendSearchTime = ref(0)

// 交互方法
const commitFriendSearch = async () => {
    const raw = searchFriend.value.trim()
    const now = Date.now()

    // 未变化则直接返回
    if (raw === lastFriendQuery.value) return
    // 限制搜索间隔
    if (now - lastFriendSearchTime.value < MIN_FRIEND_SEARCH_INTERVAL) {
        ElMessage.warning('搜索过于频繁，请稍后再试')
        return
    }

    if (!raw) {
        filteredUsers.splice(0, filteredUsers.length);
        lastFriendQuery.value = ''
        lastFriendSearchTime.value = now
        return
    }
    const isDigits = /^\d+$/.test(raw)
    let res: any = null
    try {
        if (isDigits) {
            if (raw.length > 11) {
                // 按ID查询（长于手机号的数字）
                const idNum = BigInt(raw)
                res = await getUserInfo([idNum])
            } else if (raw.length === 11) {
                // 按手机号查询（11位纯数字）
                res = await getUserInfoByPhone(raw)
            } else {
                res = await getUserInfoByName(raw)
            }
        } else {
            // 非纯数字，按名字查询
            res = await getUserInfoByName(raw)
        }

        const normalize = (payload: any): UserInfo[] => {
            const mapOne = (u: any): UserInfo => ({
                user_id: BigInt(u?.user_id ?? u?.id ?? ''),
                user_name: String(u?.user_name ?? u?.name ?? ''),
                gender: u.gender,
                avatar: u?.avatar ?? '',
                personal_signature: u?.personal_signature ?? u?.signature ?? '',
                phone: u?.phone ?? '',
                join_type: u.join_type ?? 1
            })
            const data = payload?.data ?? payload
            if (!data) return []
            if (Array.isArray(data)) return data.map(mapOne)
            if (typeof data === 'object') {
                if (data.user_id !== undefined) return [mapOne(data)]
                return Object.values(data).map(mapOne)
            }
            return []
        }

        res = res.data.data
        let list = normalize(res)
        if (list.length === 0) {
            ElMessage.warning('未找到符合条件的用户')
            return
        }
        // 更新结果列表（保持响应式）
        filteredUsers.splice(0, filteredUsers.length, ...list)
    } catch (e) {
        // 查询异常时清空列表
        console.log(e)
        filteredUsers.splice(0, filteredUsers.length)
    } finally {
        // 记录最后一次查询内容与时间
        lastFriendQuery.value = raw
        lastFriendSearchTime.value = now
    }
}
const commitGroupSearch = async () => {
    const raw = searchGroup.value.trim()
    // 清空时重置列表
    if (!raw) {
        filteredGroups.splice(0, filteredGroups.length)
        return
    }
    const isDigits = /^\d+$/.test(raw)
    let results: GroupInfo[] = []

    try {
        if (isDigits) {
            let res = await getGroupList({
                id: BigInt(raw),
                ownerId: BigInt(0),
                name: ""
            })
        } else {
            let res = await getGroupList({
                id: BigInt(0),
                ownerId: BigInt(0),
                name: raw
            })
            res = res.data.data
            if (Array.isArray(res)) {
                res.forEach(item => {
                    relationStore.setGroup({
                        id: BigInt(item.id),
                        name: item.name,
                        avatar: item.avatar,
                        owner_id: BigInt(item.owner_id),
                        updated_at: item.updated_at,
                        created_at: item.created_at,
                        members: item.members.map((m: any) => ({
                            group_id: BigInt(m.group_id),
                            user_id: BigInt(m.user_id),
                            role: m.role,
                            nickname: m.nickname,
                            joined_at: m.joined_at,
                        }))
                    })
                    results.push({
                        id: BigInt(item.id),
                        name: item.name,
                        avatar: item.avatar,
                        owner_id: BigInt(item.owner_id),
                        updated_at: item.updated_at,
                        created_at: item.created_at,
                        members: item.members.map((m: any) => ({
                            group_id: BigInt(m.group_id),
                            user_id: BigInt(m.user_id),
                            role: m.role,
                            nickname: m.nickname,
                            joined_at: m.joined_at,
                        }))
                    })

                })
            }
        }
    } catch (e) {
        console.log(e)
    }

    // 更新结果列表（保持响应式）
    if (results.length === 0) {
        ElMessage.warning('未找到匹配的群组')
        filteredGroups = []
    } else {
        console.log(results.length)
        filteredGroups.splice(0, filteredGroups.length, ...results)
    }
}
// 验证消息弹窗状态
const verifyModalOpen = ref(false)
const selectedUser = ref<UserInfo | null>(null)
const selectedGroup = ref<GroupInfo | null>(null)
const errorActive = ref(false)

const onAddFriendClick = (u: UserInfo) => {
    selectedUser.value = u
    verifyMessage.value = ''
    errorActive.value = false
    verifyModalOpen.value = true
}
const closeVerifyModal = () => {
    verifyModalOpen.value = false
    selectedUser.value = null
    selectedGroup.value = null
}
const confirmSend = async () => {
    console.dir(verifyMessage.value)
    try {
        if (selectedUser.value) {
            let res = await newFriendApply({
                target: selectedUser.value.user_id,
                sender: userStore.userInfo?.user_id ?? BigInt(0),
                authContent: verifyMessage.value
            })
            ElMessage.success('申请发送成功')
            applyStore.setFriendApply({
                apply_id: res.data.apply_id,
                sender_id: userStore.userInfo?.user_id ?? BigInt(0),
                user_id: selectedUser.value.user_id,
                time: BigInt(Date.now()),
                message: verifyMessage.value,
                status: 1
            })
            const applymsg: ApplyMsg = {
                apply_id: res.data.apply_id,
                relation_id: userStore.userInfo.user_id,
                status: 1,
                reason: '',
                update_at: Date.now(),
                type: 'friend',
            }
            WebSocketCli.SendMessage({
                id: '',
                msgType: MsgType.ApplyUpdate,
                sender_id: userStore.userInfo.user_id,
                receivers: [selectedUser.value.user_id],
                timestamp: Date.now(),
                content: '',
                extra: {
                    apply: applymsg
                }
            })
        } else if (selectedGroup.value) {
            const loading = ElLoading.service({
                lock: true,
                text: '加入群组中...',
                background: 'rgba(0, 0, 0, 0.7)'
            })
            try {
                let res = await joinGroup({
                    groupId: selectedGroup.value.id,
                    sender: userStore.userInfo?.user_id,
                    receiver: selectedGroup.value.owner_id,
                    msg: verifyMessage.value
                })
                res = res.data
                applyStore.setGroupApply({
                    request_id: res.data.request_id,
                    group_id: BigInt(res.data.group_id),
                    sender_id: userStore.userInfo?.user_id,
                    request_time: res.data.request_time,
                    message: verifyMessage.value,
                    status: res.data.status,
                })
                const applymsg: ApplyMsg = {
                    apply_id: res.data.apply_id,
                    relation_id: BigInt(res.data.group_id),
                    status: res.data.status,
                    reason: '',
                    update_at: Date.now(),
                    type: 'group',
                }
                WebSocketCli.SendMessage({
                    id: '',
                    msgType: MsgType.ApplyUpdate,
                    sender_id: userStore.userInfo.user_id,
                    receivers: [selectedGroup.value.owner_id],
                    timestamp: Date.now(),
                    content: '',
                    extra: {
                        apply: applymsg
                    }
                })
                ElMessage.success('加入申请已发送')
            } finally {
                loading.close()
            }
        }
        closeVerifyModal()
    } catch (e) {
        console.log(e)
    }
}
const onJoinGroupClick = (g: GroupInfo) => {
    selectedGroup.value = g
    verifyMessage.value = ''
    errorActive.value = false
    verifyModalOpen.value = true
}
const onCreateGroup = async () => {
    const name = groupName.value.trim()
    if (!name) return
    try {
        let res = await createGroup({
            name
        })
        res = res.data
        console.log(res.data)
        ElMessage.success('群聊创建成功')
        groupName.value = ""
        relationStore.setGroup({
            id: BigInt(res.data.id),
            name: res.data.name,
            avatar: '',
            owner_id: BigInt(res.data.owner_id),
            created_at: res.data.created_at,
            updated_at: res.data.updated_at,
            members: res.data.members.map((m: any) => ({
                group_id: BigInt(m.group_id),
                user_id: BigInt(m.user_id),
                role: m.role,
                nickname: m.nickname,
                joined_at: m.joined_at,
            }))
        })
        closeVerifyModal()
    } catch (e) {
        console.log(e)
    }
}
const groupName = ref('')
</script>

<style scoped>
.overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.35);
    display: flex;
    align-items: center;
    justify-content: center;
    /* z-index: 1000; */
    -webkit-app-region: drag;
}

/* 子弹窗覆盖层（在主对话框之上） */
.verify-modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1100;
    -webkit-app-region: no-drag;
}

.verify-modal {
    width: 520px;
    background: #fff;
    border-radius: 10px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
    overflow: hidden;
}

.modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    border-bottom: 1px solid #e1e8ed;
    background: #fafbfc;
}

.target-info {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;

    .avatar {
        width: 45px;
        height: 45px;
    }
}

.modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 16px;
}

.btn {
    border: 1px solid #e1e8ed;
    border-radius: 6px;
    padding: 8px 14px;
    cursor: pointer;
    -webkit-app-region: no-drag;
}

.btn.cancel {
    background: #f4f5f7;
    color: #2c3e50;
}

.btn.send {
    background: #3498db;
    color: #fff;
    border-color: #3498db;
}

.btn.send:disabled {
    background: #aacdea;
    cursor: not-allowed;
}

.error-tip {
    color: #e74c3c;
    font-size: 12px;
    padding: 0 16px 12px 16px;
}

.dialog.qq-style {
    width: 100%;
    height: 100%;
    background: #fff;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

.dialog-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 18px 16px;
    border-bottom: 1px solid #e1e8ed;
    background: #fafbfc;
}

.title {
    font-size: 16px;
    font-weight: 600;
    color: #2c3e50;
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

.content {
    padding: 16px;
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

.tab-panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
    flex: 1;
    min-height: 0;
}

.search-input {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border: 1px solid #e1e8ed;
    border-radius: 8px;
    background: #fff;
    -webkit-app-region: no-drag;
}

.search-input .icon {
    width: 18px;
    height: 18px;
    fill: #95a5a6;
}

.search-input input {
    flex: 1;
    border: none;
    outline: none;
    font-size: 14px;
}

.result-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
}

.result-item {
    display: flex;
    align-items: center;
    padding: 10px;
    border: 1px solid #f0f0f0;
    border-radius: 8px;
    background: #fff;
    transition: background .2s;
    -webkit-app-region: no-drag;
    gap: 5px;
}

.result-item:hover {
    background: #f7f9fb;
}

.avatar-wrap {
    width: 48px;
    height: 48px;
}

.group-avatar {
    width: 45px;
    height: 45px;
    margin-right: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.group-avatar svg {
    width: 24px;
    height: 24px;
    fill: #6c757d;
}

.info {
    flex: 1;
    min-width: 0;
}

.line1 {
    display: flex;
    align-items: center;
    gap: 10px;
}

.name {
    font-weight: 600;
    color: #2c3e50;
}

.uid {
    font-size: 12px;
    color: #95a5a6;
}

.members {
    font-size: 12px;
    color: #95a5a6;
}

.status {
    font-size: 12px;
    padding: 2px 6px;
    border-radius: 12px;
    background: #f1f3f5;
    color: #6c757d;
}

.status.online {
    background: #e8f6ef;
    color: #27ae60;
}

.status.away {
    background: #fff4e6;
    color: #f39c12;
}

.status.offline {
    background: #ecf0f1;
    color: #95a5a6;
}

.line2 {
    font-size: 13px;
    color: #6c757d;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.actions {
    display: flex;
    gap: 8px;
    -webkit-app-region: no-drag;
}

.result-state {
    padding: 6px 10px;
    border-radius: 16px;
    font-size: 12px;
    line-height: 1;
    border: 1px solid #e1e8ed;
}

.result-state.added {
    background: #e8f6ef;
    color: #27ae60;
    border-color: #cdebd8;
}

.result-state.self {
    background: #eef2f6;
    color: #6c757d;
    border-color: #e1e8ed;
}

.actions .primary {
    background: #3498db;
    color: #fff;
    border: none;
    border-radius: 6px;
    padding: 6px 12px;
    cursor: pointer;
}

.actions .primary:disabled {
    background: #aacdea;
    cursor: not-allowed;
}

.joined,
.pending {
    padding: 6px 10px;
    border-radius: 16px;
    font-size: 12px;
    line-height: 1;
    border: 1px solid #e1e8ed;
}

.joined {
    background: #e8f6ef;
    color: #27ae60;
    border-color: #cdebd8;
}

.pending {
    background: #fff4e6;
    color: #f39c12;
    border-color: #fae5cd;
}

.verify-toggle {
    display: flex;
    justify-content: flex-end;
}

.link {
    background: none;
    border: none;
    color: #3498db;
    cursor: pointer;
    padding: 0;
    -webkit-app-region: no-drag;
}

.form-row label {
    display: block;
    font-size: 13px;
    color: #6c757d;
    margin-bottom: 6px;
    margin-left: 10px;
}

.input-row {
    display: flex;
    align-items: center;
    justify-content: center;

    textarea {
        width: 95%;
        height: 72px;
        resize: none;
        line-height: 1.6;
        box-sizing: border-box;
    }
}

.label-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.label-row .char-count {
    padding-right: 10px;
    font-size: 12px;
    color: #95a5a6;
}

.form-row textarea,
.form-row input {
    box-sizing: border-box;
    padding: 8px 10px;
    border: 1px solid #e1e8ed;
    border-radius: 6px;
    outline: none;
    font-size: 14px;
    background: #fff;
    -webkit-app-region: no-drag;
}

.form-row textarea:focus,
.form-row input:focus {
    border-color: #3498db;
}

.divider {
    text-align: center;
    color: #95a5a6;
    font-size: 12px;
    margin: 4px 0 4px;
}

.empty {
    text-align: center;
    color: #95a5a6;
    font-size: 13px;
    padding: 12px 0;
}
</style>