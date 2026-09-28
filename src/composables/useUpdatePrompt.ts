/**
 * 可选更新提示（登录窗 / 主窗口挂载）
 *
 * 编排：拉取 + 监听主进程发现的可选更新 → 用 CusDialog 弹提示 → 回传用户选择。
 * 检查、下载、安装都在主进程，用户选「立即更新」后由主进程打开更新窗口。
 */
import { h, onMounted, onUnmounted } from 'vue'
import CusDialog, { DialogResult } from '@/src/components/CusDialog'
import ReleaseNotes from '@/src/components/ReleaseNotes.vue'
import { updateService } from '@/src/services'
import type { UpdatePromptAction, UpdatePromptInfo } from '@shared/types'

function toAction(result: DialogResult): UpdatePromptAction {
    if (result === DialogResult.Confirm) return 'update'
    if (result === DialogResult.Extra) return 'skip'
    // 取消、右上角关闭都按「稍后」：本次不再提示，下次启动还会提示
    return 'later'
}

export function useUpdatePrompt(): void {
    // 主进程推送与挂载时补拉可能同时送达同一条提示，同一版本只弹一次
    let shownVersion = ''

    const show = async (info: UpdatePromptInfo) => {
        if (shownVersion === info.version) return
        shownVersion = info.version

        const result = await CusDialog.open({
            title: '发现新版本',
            status: 'accent',
            content: () => h(ReleaseNotes, {
                version: info.version,
                currentVersion: info.currentVersion,
                notes: info.releaseNotes,
            }),
            confirmText: '立即更新',
            cancelText: '稍后',
            extraText: '跳过此版本',
        })
        updateService.respondPrompt(toAction(result))
    }

    onMounted(async () => {
        // 先挂监听再补拉：检查可能恰好在两者之间完成
        updateService.onPrompt((info) => void show(info))
        const pending = await updateService.getPrompt()
        if (pending) void show(pending)
    })

    onUnmounted(() => {
        updateService.offPrompt()
    })
}
