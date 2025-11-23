<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useUserStore } from '@/store/user'
import { useRelationStore } from '@/store/relationMap'
import { useApplyStore } from './store/apply'
import { UserInfo } from '@/models/user'
import { useContactStore } from '@/store/contact'
import { WebSocketCli } from '@/websocket'
import { useChatStore } from '@/store/chat'
import { sqlJsDB } from '@/utils/sqljs'
const userStore = useUserStore()
const relationStore = useRelationStore()
const applyInfoStore = useApplyStore()
const contactStore = useContactStore()

const isAppMounted = ref(true)

onMounted(() => {
    window.ipcRenderer.once('init-data', (e, data) => {
        if (data.token)
            userStore.setToken(data.token)
        if (data.user)
            userStore.setUserInfo(data.user)
        if (data.userMap)
            relationStore.Fdeserialize(data.userMap)
        if (data.groupMap)
            relationStore.Gdeserialize(data.groupMap)
        if (data.applyMap) {
            if (data.applyMap.friend)
                applyInfoStore.Fdeserialize(data.applyMap.friend)
        }
        if (data.contact) {
            if (data.contact.friend)
                contactStore.Fdeserialize(data.contact.friend)
            if (data.contact.group)
                contactStore.Groups = data.contact.group
        }
    })
    window.ipcRenderer.on('update-userinfo', (e, { user, token }) => {
        userStore.setUserInfo(user)
        userStore.setToken(token)
    });
    window.ipcRenderer.on('update-token', (e, { data }) => {
        userStore.setToken(data)
    })
    window.ipcRenderer.on('update-user-map', (e, user: UserInfo) => {
        relationStore.userMap.set(user.user_id, user)
        const now = Date.now()
        sqlJsDB.saveUsers([{ userId: user.user_id.toString(), data: { ...user }, updatedAt: now, expiresAt: now + 7 * 24 * 60 * 60 * 1000 }])
    })
    window.ipcRenderer.on('new-apply-info', (e, { type, applyInfo }) => {
        if (type === 'friend') {
            applyInfoStore.FriendApplyMap.set(applyInfo.apply_id, applyInfo)
            applyInfoStore.FriendIDMap.set(BigInt(applyInfo.user_id), applyInfo.apply_id)
        } else {
            applyInfoStore.GrooupApplyMap.set(applyInfo.request_id, applyInfo)
            applyInfoStore.GroupIDMap.set(BigInt(applyInfo.group_id), applyInfo.request_id)
        }
    })
    window.ipcRenderer.on('update-group-map', (e, group: any) => {
        relationStore.groupMap.set(group.id, group)
        const now = Date.now()
        sqlJsDB.saveGroups([{ groupId: group.id.toString(), data: { ...group }, updatedAt: now, expiresAt: now + 7 * 24 * 60 * 60 * 1000 }])
    })
    window.ipcRenderer.once('app-quit', async () => {
        isAppMounted.value = false
        await nextTick()
        const chatStore = useChatStore()
        const ownerId = String(useUserStore().userId || '')
        const sessionCache = {
          ownerId,
          data: chatStore.chats.map((chat) => ({ sessionId: chat.session_id, data: { ...chat } })),
        }
        sqlJsDB.saveSessions(sessionCache)
        await sqlJsDB.persist()
        WebSocketCli.close()
        
        window.close()
    })
    window.ipcRenderer.send('window:get-init-data')
})
onUnmounted(() => {
    window.ipcRenderer.removeAllListeners('update-userinfo')
    window.ipcRenderer.removeAllListeners('update-token')
    window.ipcRenderer.removeAllListeners('update-user-map')
    window.ipcRenderer.removeAllListeners('new-apply-info')
    window.ipcRenderer.removeAllListeners('update-group-map')
})
</script>

<template>
    <div class="container" v-if="isAppMounted">
        <router-view></router-view>
    </div>
</template>

<style lang="scss" scoped>
.container {
    -webkit-app-region: drag;
    position: fixed;
    width: 100%;
    height: 100%;
    left: 0;
    top: 0;

    &>* {
        position: absolute;
        width: 100%;
        height: 100%;
    }
}
</style>