/**
 * 历史消息窗口监听器
 * 处理 MSG_RECALLED：主进程在撤回落库后推送被撤回消息的 msgId，从历史列表里移除
 */

import { ipcService } from '../ipcService'
import { IpcChannels } from '@shared/types'
import { useHistoryStore } from '@/src/store/history'

export function initHistoryListener(): void {
    ipcService.on(IpcChannels.MSG_RECALLED, (_event, msgIds: unknown) => {
        if (Array.isArray(msgIds)) useHistoryStore().removeRecalled(msgIds)
    })
}
