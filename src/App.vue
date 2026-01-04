<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useRelationStore } from '@/store/relationMap'
import { useApplyStore } from './store/apply'
import { sqlJsDB } from '@/utils/sqljs'
import { resourceManager } from '@/utils/resourceManager'

const relationStore = useRelationStore()
const applyInfoStore = useApplyStore()

const isAppMounted = ref(true)

onMounted(() => {
    // 初始化资源管理器
    resourceManager.init()

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
        // await nextTick()
        // const chatStore = useChatStore()
        // const ownerId = String(useUserStore().userId || '')
        // const sessionCache = {
        //   ownerId,
        //   data: chatStore.chats.map((chat) => ({ sessionId: chat.session_id, data: { ...chat } })),
        // }
        // sqlJsDB.saveSessions(sessionCache)
        // await sqlJsDB.persist()
        // WebSocketCli.close()
        await nextTick().then(() => {
            window.close()
        })
    })
})
onUnmounted(() => {
    // 销毁资源管理器
    resourceManager.destroy()
    
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