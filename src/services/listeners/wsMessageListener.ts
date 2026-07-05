/**
 * WebSocket 消息监听器
 * 处理 WS_MESSAGE 和 WS_MESSAGE_ACK IPC 频道
 * 负责将收到的 WS 消息写入 ChatStore，并处理 ACK 状态回写
 */

import { ipcService } from '../ipcService'
import { IpcChannels, ImTypes, IChatMessage } from '@/src/types'
import { ElMessage } from 'element-plus'
import { convertWSMessageToIChatMessage } from '@/src/utils/messageConverter';
import { messageService } from '@/src/services'
import { useMessageStore } from '@/src/store/message'

export function initWsMessageListener(): void {
    // 新消息到达
    ipcService.on(IpcChannels.WS_MESSAGE, async (_event, data: { type: ImTypes.MessageType; payload: any }) => {
        const chatMsg = convertWSMessageToIChatMessage(data.payload as ImTypes.WSMessage)
        if (!chatMsg) {
            console.error('[WsMessageListener] Failed to convert WSMessage to IChatMessage')
            return
        }
        void messageService.saveMessage(chatMsg).catch((e) => {
            console.error('[MessageStore] Failed to persist message', e);
        });

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
        const messageStore = useMessageStore()
        console.log('[WsMessageListener] Received MessageAck:', data)

        const ackStatus = data.ack.status ?? (data.ack as any).ack_status;
        let msg: IChatMessage | undefined;
        let newStatus: number | undefined;

        if (ackStatus === ImTypes.AckStatus.ACK_STATUS_FAILED) {
            newStatus = ImTypes.MessageStatus.MESSAGE_STATUS_FAILED;
        } else if (ackStatus === ImTypes.AckStatus.ACK_STATUS_SUCCESS) {
            newStatus = ImTypes.MessageStatus.MESSAGE_STATUS_SENT;
        }
        msg = messageStore.updateMessageStatus(
            data.ack.session_id,
            data.ack.client_id,
            newStatus!,
            data.timestamp
        );

        if (msg) {
            void messageService.saveMessage(msg).catch((e) => {
                console.error('[MessageStore] Failed to update message from MessageAck', e);
            });
        }
        console.log("MessageAck 处理后消息: ", msg)
    })

    ipcService.on(IpcChannels.WS_MESSAGE_PERSIST_ACK, async (_event, data: { ack: ImTypes.PersistAck; timestamp: number }) => {
        const messageStore = useMessageStore()
        console.log('[WsMessageListener] Received PersistAck:', data)

        let msg: IChatMessage | undefined;
        if (data.ack.ack_status === ImTypes.AckStatus.ACK_STATUS_FAILED) {
            msg = messageStore.updateMessageStatus(data.ack.session_id, data.ack.client_id, ImTypes.MessageStatus.MESSAGE_STATUS_FAILED, data.timestamp)
        } else if (data.ack.ack_status === ImTypes.AckStatus.ACK_STATUS_SUCCESS) {
            msg = messageStore.updateMessageStatus(data.ack.session_id, data.ack.client_id, ImTypes.MessageStatus.MESSAGE_STATUS_DELIVERED, data.timestamp, data.ack.msg_id, data.ack.seq)
        }
        if (msg) {
            void messageService.saveMessage(msg).catch((e) => {
                console.error('[MessageStore] Failed to update message', e);
            });
        }
    })
}
