/**
 * 消息定位监听器（主窗口）
 * 处理 CHAT_JUMP_TO_MESSAGE：历史消息窗口双击某条消息，经主进程转发过来，定位到这条消息并闪烁
 */

import { ipcService } from '../ipcService'
import { IpcChannels } from '@shared/types'
import type { MessageJumpTarget } from '@shared/types/window'
import { useChatNavigation } from '@/src/composables/useChatNavigation'
import { jumpToMessage } from '@/src/composables/messageJump'

export function initChatJumpListener(): void {
    // 监听在 App.vue 的 setup 里初始化，此时能取到 router（useChatNavigation 内部用 useRouter）
    const { navigateToChat } = useChatNavigation()
    ipcService.on(IpcChannels.CHAT_JUMP_TO_MESSAGE, (_event, target: MessageJumpTarget) => {
        if (target?.sessionKey && target.msgId) void jumpToMessage(target, navigateToChat)
    })
}
