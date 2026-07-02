/**
 * WebSocket 消息监听器
 * 处理 WS_MESSAGE 和 WS_MESSAGE_ACK IPC 频道
 * 负责将收到的 WS 消息写入 ChatStore，并处理 ACK 状态回写
 */

import { ipcService } from '../ipcService'
import { useAppStore } from '@/src/store/app'
import { IpcChannels, ImTypes, CurrentRoute } from '@/src/types'
import { ElMessage } from 'element-plus'
import { useSessionStore } from '@/src/store/session'
import { useMessageStore } from '@/src/store/message'
import { convertWSMessageToIChatMessage, checkAndClearInvalidLocalPath } from '@/src/utils/messageConverter';
import windowService from '../windowService'
import { fileService } from '../fileService'

export function initWsMessageListener(): void {
    // 新消息到达
    ipcService.on(IpcChannels.WS_MESSAGE, async (_event, data: { type: ImTypes.MessageType; payload: any }) => {
        const conversationStore = useSessionStore()
        const messageStore = useMessageStore()
        const appStore = useAppStore()

        const chatMsg = convertWSMessageToIChatMessage(data.payload as ImTypes.WSMessage)
        if (!chatMsg) {
            console.error('[WsMessageListener] Failed to convert WSMessage to IChatMessage')
            return
        }
        console.log('[WsMessageListener] Received WSMessage:', chatMsg)
        messageStore.upsertMessage(chatMsg)

        const isCurrentChat = (chatMsg.sessionKey && chatMsg.sessionKey === conversationStore.currentSessionKey) ||
                              (chatMsg.sessionId === conversationStore.currentSessionId);

        if (!isCurrentChat || !await windowService.isFocused() || appStore.currentRoute !== CurrentRoute.Chat) {
            conversationStore.incrementUnread(chatMsg.sessionId)
            if (conversationStore.currentSession?.is_disturb !== 2)
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
        console.log('[WsMessageListener] Received MessageAck:', data)
    })

    ipcService.on(IpcChannels.WS_MESSAGE_PERSIST_ACK, async (_event, data: { ack: ImTypes.PersistAck; timestamp: number }) => {
        const messageStore = useMessageStore()
        const conversationStore = useSessionStore()
        console.log('[WsMessageListener] Received PersistAck:', data)

        if (data.ack.session_id && data.ack.session_key) {
            const chat = conversationStore.getSession(data.ack.session_key);
            if (chat && !chat.session_id) {
                chat.session_id = data.ack.session_id;
                void conversationStore.saveToStorage();
            }
        }

        if (data.ack.ack_status === ImTypes.AckStatus.ACK_STATUS_FAILED) {
            messageStore.updateMessageStatus(data.ack.session_id, data.ack.client_id, ImTypes.MessageStatus.MESSAGE_STATUS_FAILED, data.timestamp)
        } else if (data.ack.ack_status === ImTypes.AckStatus.ACK_STATUS_SUCCESS) {
            messageStore.updateMessageStatus(data.ack.session_id, data.ack.client_id, ImTypes.MessageStatus.MESSAGE_STATUS_DELIVERED, data.timestamp, data.ack.msg_id, data.ack.seq)
        }
    })
}
