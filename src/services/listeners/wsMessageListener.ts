/**
 * WebSocket 消息监听器
 * 处理 WS_MESSAGE 和 WS_MESSAGE_ACK IPC 频道
 *
 * 职责边界（遵守四层架构规范）：
 *  - 调用 messageStore.receiveMessage() 做纯状态更新（同步）
 *  - 自行负责所有副作用：持久化 SQLite、提示音、Session 持久化
 *  - 禁止直接修改 Store 的 state 字段
 */

import { toRaw } from 'vue';
import { ipcService } from '../ipcService';
import { IpcChannels, ImTypes, IChatMessage } from '@shared/types';
import { ElMessage } from 'element-plus';
import { convertWSMessageToIChatMessage, getLastContent } from '@/src/utils/messageConverter';
import { useMessageStore } from '@/src/store/message';
import { useUserStore } from '@/src/store/user';
import { messageService } from '@/src/services/messageService';
import { sessionService } from '@/src/services/sessionService';
import { windowService } from '@/src/services/windowService';
import { useSessionStore } from '@/src/store/session';
import { chatService } from '@/src/services/chatService';

export function initWsMessageListener(): void {

    // ── 新消息到达 ────────────────────────────────────────────────────────────
    ipcService.on(IpcChannels.WS_MESSAGE, async (_event, data: { type: ImTypes.MessageType; payload: any }) => {
        const chatMsg = convertWSMessageToIChatMessage(data.payload as ImTypes.WSMessage);
        if (!chatMsg) {
            console.error('[WsMessageListener] Failed to convert WSMessage to IChatMessage');
            return;
        }

        const userStore = useUserStore();
        const sessionStore = useSessionStore();
        const isFromSelf = chatMsg.fromUserId === userStore.userID;

        // 0. seq 断层检测：对比本地 max_seq，若存在缺口则从服务端补拉丢失的消息
        const incomingSeq = chatMsg.seq ?? 0;
        if (incomingSeq > 0) {
            const existingSession = sessionStore.getSession(chatMsg.sessionKey as string);
            const localMaxSeq = existingSession?.max_seq ?? 0;
            if (localMaxSeq > 0 && incomingSeq > localMaxSeq + 1) {
                const gapStart = localMaxSeq + 1;
                const gapEnd = incomingSeq - 1;
                console.warn(`[WsMessageListener] Seq gap in ${chatMsg.sessionKey}: expected ${gapStart}, got ${incomingSeq}. Fetching [${gapStart}, ${gapEnd}]...`);
                try {
                    const missing = await chatService.fetchMissingMessages(
                        chatMsg.sessionKey as string,
                        gapStart,
                        gapEnd,
                    );
                    if (missing.length > 0) {
                        const messageStore = useMessageStore();
                        missing.forEach(m => messageStore.upsertMessage(m));
                        console.log(`[WsMessageListener] Gap filled: ${missing.length} messages fetched.`);
                    }
                } catch (e) {
                    console.error('[WsMessageListener] Failed to fetch missing messages for gap', e);
                }
            }
        }

        // 1. 纯状态更新（同步，无 I/O）
        const updatedSession = sessionStore.upsertSession({
            session_key: chatMsg.sessionKey as string,
            session_id: chatMsg.sessionId,
            max_seq: chatMsg.seq,
            last_content: getLastContent(chatMsg),
            last_sender: chatMsg.fromUserId,
            update_time: chatMsg.sendTime,
        });
        sessionStore.incrementUnread(chatMsg.sessionKey as string);
        useMessageStore().upsertMessage(chatMsg);

        // 2. 副作用：提示音（仅对方消息）
        if (!isFromSelf) {
            windowService.playNotificationSound();
        }

        // 3. 副作用：持久化消息到本地 SQLite
        try {
            await messageService.saveMessage(toRaw(chatMsg) as IChatMessage);
        } catch (e: any) {
            console.error('[WsMessageListener] Failed to persist message', e);
        }

        // 4. 副作用：持久化会话摘要变更到本地 SQLite
        if (updatedSession) {
            void sessionService.saveMany([toRaw(updatedSession)]);
        }

        // 5. 处理错误类型消息
        if (data.type === ImTypes.MessageType.ERROR) {
            const errorMsg = data.payload as ImTypes.ErrorMessage;
            ElMessage.error(errorMsg.error_msg || '未知错误');
        }
    });

    // ── 消息送达 ACK（仅需更新状态并重新落库，不触发未读/提示音）─────────────
    ipcService.on(IpcChannels.WS_MESSAGE_ACK, async (_event, data: { ack: ImTypes.MessageAck; timestamp: number }) => {
        const messageStore = useMessageStore();
        console.log('[WsMessageListener] Received MessageAck:', data);

        const ackStatus = data.ack.status ?? (data.ack as any).ack_status;
        let newStatus: number | undefined;

        if (ackStatus === ImTypes.AckStatus.ACK_STATUS_FAILED) {
            newStatus = ImTypes.MessageStatus.MESSAGE_STATUS_FAILED;
        } else if (ackStatus === ImTypes.AckStatus.ACK_STATUS_SUCCESS) {
            newStatus = ImTypes.MessageStatus.MESSAGE_STATUS_SENT;
        }

        const msg = messageStore.updateMessageStatus(
            data.ack.session_id,
            data.ack.client_id,
            newStatus!,
            data.timestamp
        );
        console.log('MessageAck 处理后消息: ', msg);

        // 只需把状态变更持久化，不走 receiveMessage（避免重复未读/摘要更新）
        if (msg) {
            try {
                await messageService.saveMessage(toRaw(msg) as IChatMessage);
            } catch (e: any) {
                console.error('[WsMessageListener] Failed to update message from MessageAck', e);
            }
        }
    });

    // ── 消息持久化 ACK（服务端确认落库，回填 msgId/seq）────────────────────────
    ipcService.on(IpcChannels.WS_MESSAGE_PERSIST_ACK, async (_event, data: { ack: ImTypes.PersistAck; timestamp: number }) => {
        const messageStore = useMessageStore();
        console.log('[WsMessageListener] Received PersistAck:', data);

        let msg: IChatMessage | undefined;
        if (data.ack.ack_status === ImTypes.AckStatus.ACK_STATUS_FAILED) {
            msg = messageStore.updateMessageStatus(data.ack.session_id, data.ack.client_id, ImTypes.MessageStatus.MESSAGE_STATUS_FAILED, data.timestamp);
        } else if (data.ack.ack_status === ImTypes.AckStatus.ACK_STATUS_SUCCESS) {
            msg = messageStore.updateMessageStatus(data.ack.session_id, data.ack.client_id, ImTypes.MessageStatus.MESSAGE_STATUS_DELIVERED, data.timestamp, data.ack.msg_id, data.ack.seq);
        }

        // 同样只持久化状态变更，不走 receiveMessage
        if (msg) {
            try {
                await messageService.saveMessage(toRaw(msg) as IChatMessage);
            } catch (e: any) {
                console.error('[WsMessageListener] Failed to update message from PersistAck', e);
            }
        }
    });
}
