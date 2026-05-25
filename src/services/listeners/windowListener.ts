/**
 * 窗口状态监听器
 * 处理 WINDOW_STATE IPC 频道
 * 负责响应窗口聚焦/失焦等状态变化
 */

import { ipcService } from '../ipcService'
import { IpcChannels } from '@/types'
import { useChatStore } from '@/store/chat'

export function initWindowListener(): void {
    ipcService.on(IpcChannels.WINDOW_STATE, (_event, state) => {
        const chatStore = useChatStore()
        switch (state) {
            case 'focused':
                chatStore.clearUnread(chatStore.currentSessionId)
                break
            default:
                break
        }
    })
}
