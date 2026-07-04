/**
 * 窗口状态监听器
 * 处理 WINDOW_STATE IPC 频道
 * 负责响应窗口聚焦/失焦等状态变化
 */

import { ipcService } from '../ipcService'
import { IpcChannels } from '@/src/types'
import { useSessionStore } from '@/src/store/session'

export function initWindowListener(): void {
    ipcService.on(IpcChannels.WINDOW_STATE, (_event, state) => {
        const conversationStore = useSessionStore()
        switch (state) {
            case 'focused':
                conversationStore.clearUnread(conversationStore.currentSessionKey)
                break
            default:
                break
        }
    })
}
