<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import CusDialog from './components/CusDialog/CusDialog'
import { useUserStore } from './store/user'
import { ipcService, windowService, tokenService, listenerService, LogoutType } from '@/services'
import { IpcChannels } from '@/types'

const isAppMounted = ref(false)

onMounted(() => {
    // 初始化 IPC 监听器
    try {
        listenerService.init()

        ipcService.once(IpcChannels.APP_QUIT, async () => {
            isAppMounted.value = false
            await nextTick().then(() => {
                window.close()
            })
        })
        ipcService.on(IpcChannels.LOGOUT_REMIND, async (_e, data) => {
            if (data.type === LogoutType.KICKED) {
                await CusDialog.open({
                    title: '消息',
                    showCancel: false,
                    content: '账号在其他设备登录，将退出登录',
                    confirmText: '确定',
                })
            } else if (data.type === LogoutType.LOGOUT) {
                await CusDialog.open({
                    title: '消息',
                    showCancel: false,
                    content: '身份已失效，请重新登录',
                    confirmText: '确定',
                })
            }
            windowService.sendLogout()
        })
        tokenService.getAllInfo().then((data) => {
            if (data.success && data.token) {
                useUserStore().setToken(data.token)
            }
        }).finally(() => {
            isAppMounted.value = true
        })
    } catch (error) {
        console.error('Failed to set up IPC listeners:', error)
        isAppMounted.value = true
    }

})
onUnmounted(() => {
    // 销毁 IPC 监听器
    ipcService.removeAllListeners()
    listenerService.destroy()
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
        user-select: none;
    }
}
</style>