/**
 * 设置页「检查更新」（关于页挂载）
 *
 * 编排：手动检查 → 已是最新 / 失败给出提示；有新版本就把版本号交给页面显示「立即更新」，
 * 点了由主进程打开更新窗口下载，之后与登录后的更新提示框选「立即更新」同一流程。
 */
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { updateService } from '@/src/services'

export function useUpdateCheck() {
    /** 当前应用版本号 */
    const currentVersion = ref('')
    const checking = ref(false)
    /** 检查发现的新版本，非空时显示「立即更新」 */
    const newVersion = ref('')

    const checkUpdate = async () => {
        if (checking.value) return
        checking.value = true
        try {
            const result = await updateService.check()
            if (result.status === 'available') {
                newVersion.value = result.version
            } else if (result.status === 'latest') {
                newVersion.value = ''
                ElMessage.success('当前已是最新版本')
            } else {
                ElMessage.error(`检查更新失败：${result.error}`)
            }
        } finally {
            checking.value = false
        }
    }

    const startUpdate = () => {
        updateService.start()
    }

    onMounted(async () => {
        currentVersion.value = await updateService.getVersion()
    })

    return { currentVersion, checking, newVersion, checkUpdate, startUpdate }
}
