<script setup lang="ts">
import { nextTick, ref } from 'vue'
import CusDialog, { DialogResult } from './components/CusDialog'
import { useUserStore } from './store/user'
import { ipcService, windowService, tokenService, listenerService, LogoutType } from '@/src/services'
import { cancelOfflineSync } from '@/src/composables/offlineSync'
import { IpcChannels } from '@shared/types'
import { useGroupStore } from './store/group'
import { useTheme } from '@/src/composables/useTheme'

useTheme()

const isAppMounted = ref(false)

// 初始化 IPC 监听器（在 setup 顶层执行，先于所有子组件的生命周期）
try {
    listenerService.init()

    ipcService.once(IpcChannels.APP_QUIT, async () => {
        // 会话变更已在各自发生处即时落盘，退出无需再保存，此处仅卸载 UI 并关闭窗口。
        isAppMounted.value = false
        listenerService.destroy()
        ipcService.removeAllListeners()
        await nextTick()
        window.close()
    })
    ipcService.on(IpcChannels.LOGOUT_REMIND, async (_e, data) => {
        // 身份已失效，立即中止在途的离线同步分页拉取，避免继续用失效凭证发请求
        cancelOfflineSync()
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
    // 托盘「退出登录」：主进程只发给主窗口。只有点「确定」才登出，取消 / 关闭弹框都不动
    let logoutConfirming = false
    ipcService.on(IpcChannels.LOGOUT_CONFIRM, async () => {
        // 弹框还开着时又点了一次托盘菜单：不叠第二个
        if (logoutConfirming) return
        logoutConfirming = true
        try {
            const result = await CusDialog.open({
                title: '退出登录',
                content: '确定要退出登录吗？',
                showCancel: true,
                confirmText: '确定',
                cancelText: '取消',
            })
            if (result === DialogResult.Confirm) {
                windowService.sendUserLogout()
            }
        } finally {
            logoutConfirming = false
        }
    })
    tokenService.getAllInfo().then((data) => {
        if (data.success && data.token) {
            useUserStore().setToken(data.token)
            useGroupStore().initLastReadTime(useUserStore().userID)
        }
    })
} catch (error) {
    console.error('Failed to set up IPC listeners:', error)
} finally {
    isAppMounted.value = true
}
</script>

<template>
    <div class="container" v-if="isAppMounted">
        <router-view></router-view>
    </div>
</template>

<style lang="scss">
html,
body,
#app {
    background: transparent !important;
    margin: 0;
    padding: 0;
}
</style>

<style lang="scss" scoped>
.container {
    -webkit-app-region: drag;
    position: fixed;
    width: 100%;
    height: 100%;
    left: 0;
    top: 0;
    border-radius: 8px;

    &>* {
        position: absolute;
        width: 100%;
        height: 100%;
        user-select: none;
    }
}
</style>