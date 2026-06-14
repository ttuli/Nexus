/**
 * WebSocket 消息监听器
 * 处理 WS_MESSAGE 和 WS_MESSAGE_ACK IPC 频道
 * 负责将收到的 WS 消息写入 ChatStore，并处理 ACK 状态回写
 */

import { ipcService } from '../ipcService'
import { useAppStore } from '@/src/store/app'
import { IpcChannels, ImTypes, CurrentRoute } from '@/src/types'
import { ElMessage } from 'element-plus'
import { useChatStore } from '@/src/store/chat'
import { convertWSMessageToIChatMessage, checkAndClearInvalidLocalPath } from '@/src/utils/chat'
import windowService from '../windowService'
import { fileService } from '../fileService'

export function initWsMessageListener(): void {
    // 新消息到达
    ipcService.on(IpcChannels.WS_MESSAGE, async (_event, data: { type: ImTypes.MessageType; payload: any }) => {
        const chatStore = useChatStore()
        const appStore = useAppStore()

        const chatMsg = convertWSMessageToIChatMessage(data.payload as ImTypes.WSMessage)
        if (!chatMsg) {
            console.error('[WsMessageListener] Failed to convert WSMessage to IChatMessage')
            return
        }
        console.log('[WsMessageListener] Received WSMessage:', chatMsg)
        chatStore.addMessage(chatMsg)

        // 检查文件消息的 localPath 是否本地实际存在
        checkAndClearInvalidLocalPath(chatMsg, fileService, (sessionId, clientId, msgId, localPath) => {
            chatStore.updateFileLocalPath(sessionId, clientId, msgId, localPath)
        })

        if (chatMsg.sessionId !== chatStore.currentSessionId || !await windowService.isFocused() || appStore.currentRoute !== CurrentRoute.Chat) {
            chatStore.incrementUnread(chatMsg.sessionId)
            if (chatStore.currentChat?.is_disturb !== 2)
                windowService.playNotificationSound()
        }

        switch (data.type) {
            case ImTypes.MessageType.ERROR: {
                const errorMsg = data.payload as ImTypes.ErrorMessage
                ElMessage.error(errorMsg.error_msg || '未知错误')
                break
            }
        }
    })

    // 消息送达 ACK
    ipcService.on(IpcChannels.WS_MESSAGE_ACK, async (_event, data: { ack: ImTypes.MessageAck; timestamp: number }) => {
        const chatStore = useChatStore()
        console.log('[WsMessageListener] Received MessageAck:', data)
        if (data.ack.status === ImTypes.AckStatus.ACK_STATUS_FAILED) {
            chatStore.updateMessageStatus(data.ack.session_id, data.ack.client_id, ImTypes.MessageStatus.MESSAGE_STATUS_FAILED, data.timestamp)
        } else if (data.ack.status === ImTypes.AckStatus.ACK_STATUS_SUCCESS) {
            chatStore.updateMessageStatus(data.ack.session_id, data.ack.client_id, ImTypes.MessageStatus.MESSAGE_STATUS_SENT, data.timestamp)
        }
    })

    ipcService.on(IpcChannels.WS_MESSAGE_PERSIST_ACK, async (_event, data: { ack: ImTypes.PersistAck; timestamp: number }) => {
        const chatStore = useChatStore()
        console.log('[WsMessageListener] Received PersistAck:', data)
        if (data.ack.ack_status === ImTypes.AckStatus.ACK_STATUS_FAILED) {
            chatStore.updateMessageStatus(data.ack.session_id, data.ack.client_id, ImTypes.MessageStatus.MESSAGE_STATUS_FAILED, data.timestamp)
        } else if (data.ack.ack_status === ImTypes.AckStatus.ACK_STATUS_SUCCESS) {
            chatStore.updateMessageStatus(data.ack.session_id, data.ack.client_id, ImTypes.MessageStatus.MESSAGE_STATUS_DELIVERED, data.timestamp, undefined, data.ack.seq)
        }
    })
}
