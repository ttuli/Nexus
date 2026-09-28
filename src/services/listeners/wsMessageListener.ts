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
import { reportSessionRead } from '@/src/composables/sessionActions';
import { forgetCall } from './wsCallListener';

/**
 * 通话记录是否是「本人刚处理过」的通话，不应产生未读红点。
 *
 * 后端 `CountUnread` 不排除 CHAT_CALL（未接来电必须有红点），而记录的 fromUserId
 * 恒为主叫，故只有被叫侧会计入未读。但 COMPLETED（接通聊完）与 REJECTED（自己拒接）
 * 说明被叫本人刚参与过，不特判就会「刚挂断就冒红点」。
 * 其余终态（CANCELED / MISSED / PEER_OFFLINE / BUSY / FAILED）都是没接到，红点是对的。
 */
function isSelfHandledCall(msg: IChatMessage): boolean {
    if (msg.type !== ImTypes.MessageType.CHAT_CALL) return false;
    const reason = (msg as any).endReason;
    return reason === ImTypes.CallEndReason.CALL_END_REASON_COMPLETED
        || reason === ImTypes.CallEndReason.CALL_END_REASON_REJECTED;
}

export function initWsMessageListener(): void {

    // ── 新消息到达 ────────────────────────────────────────────────────────────
    // 注：seq 已改为 Lamport 序号（不连续），无法再用 last+1 做在线断层检测；
    // 漏投由服务端持久化兜底，重连/上线时通过活跃会话 seq 对比增量补拉（syncOfflineActiveSessions）。
    ipcService.on(IpcChannels.WS_MESSAGE, async (_event, data: { type: ImTypes.MessageType; payload: any }) => {
        // 服务端错误复用了 WS_MESSAGE 通道，但载荷是已解码的 ErrorMessage 而非 WSMessage，
        // 必须在转换聊天消息之前分流，否则会被当成无法解析的消息丢弃
        if (data.type === ImTypes.MessageType.ERROR) {
            const errorMsg = data.payload as ImTypes.ErrorMessage;
            ElMessage.error(errorMsg.error_msg || '未知错误');
            return;
        }

        const chatMsg = convertWSMessageToIChatMessage(data.payload as ImTypes.WSMessage);
        if (!chatMsg) {
            console.error('[WsMessageListener] Failed to convert WSMessage to IChatMessage');
            return;
        }

        const userStore = useUserStore();
        const sessionStore = useSessionStore();
        const isFromSelf = chatMsg.fromUserId === userStore.userID;
        const isCurrentSession = sessionStore.currentSessionKey === chatMsg.sessionKey;

        // 1. 纯状态更新（同步，无 I/O）
        const updatedSession = sessionStore.upsertSession({
            session_key: chatMsg.sessionKey as string,
            session_id: chatMsg.sessionId,
            max_seq: chatMsg.seq,
            // 通话记录的预览按主被叫视角不同（"已取消" vs "未接来电"），必须传 meId，
            // 否则主叫会在自己的会话列表看到"未接来电"
            last_content: getLastContent(chatMsg, userStore.userID),
            last_sender: chatMsg.fromUserId,
            update_time: chatMsg.sendTime,
        });
        // 自己发出的消息不计未读——服务端 CountUnread 同样按 from_user_id 排除本人，
        // 本地跟着加会与服务端口径不一致（刷新会话列表时红点又消失）。
        // 常规消息的发送方收不到自己的副本，但**通话记录是服务端铸造后投递给双方的**
        // （主叫没有本地乐观副本，见 Message/rpc/listener 的补投），主叫这边会走到这里。
        if (!isFromSelf) {
            // 正在查看的会话不累计未读，而是即时前进服务端已读游标。
            // 通话记录同理：被叫本人刚参与过的通话（接通聊完 / 自己拒接）不该冒红点，
            // 且必须推进服务端游标而非只改本地数字——服务端未读是点查、不存量化，
            // 只改本地会在下次会话列表刷新时被打回
            if (isCurrentSession || isSelfHandledCall(chatMsg)) {
                reportSessionRead(chatMsg.sessionKey as string);
            } else {
                sessionStore.incrementUnread(chatMsg.sessionKey as string);
            }
        }
        useMessageStore().upsertMessage(chatMsg);

        // 通话记录到达 = 这通电话已彻底收敛，释放 wsCallListener 的来电去重记录
        if (chatMsg.type === ImTypes.MessageType.CHAT_CALL) {
            forgetCall((chatMsg as any).callId);
        }

        // 2. 副作用：提示音 + 任务栏闪烁（仅对方消息；正在查看的会话与免打扰会话静默，is_disturb: 2=开启）。
        // 通话记录一律静默：双方刚经历过这通电话（来电铃声已经响过），挂断后再响一次新消息提示只是打扰；
        // 未接来电靠未读红点提示
        const isDisturbMuted = sessionStore.getSession(chatMsg.sessionKey as string)?.is_disturb === 2;
        const isCallRecord = chatMsg.type === ImTypes.MessageType.CHAT_CALL;
        if (!isFromSelf && !isCurrentSession && !isDisturbMuted && !isCallRecord) {
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
    });

    // ── 消息送达 ACK（仅需更新状态并重新落库，不触发未读/提示音）─────────────
    ipcService.on(IpcChannels.WS_MESSAGE_ACK, async (_event, data: { ack: ImTypes.MessageAck; timestamp: number }) => {
        const messageStore = useMessageStore();
        const ackStatus = data.ack.status ?? (data.ack as any).ack_status;
        let newStatus: number | undefined;

        if (ackStatus === ImTypes.AckStatus.ACK_STATUS_FAILED) {
            newStatus = ImTypes.MessageStatus.MESSAGE_STATUS_FAILED;
        } else if (ackStatus === ImTypes.AckStatus.ACK_STATUS_SUCCESS) {
            newStatus = ImTypes.MessageStatus.MESSAGE_STATUS_SENT;
        }

        const msg = messageStore.updateMessageStatus(
            data.ack.session_id,
            '',
            data.ack.client_id,
            newStatus!,
            data.timestamp
        );

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
    // 注：成功 ACK 不再携带 session_key，消息定位依赖 client_id
    ipcService.on(IpcChannels.WS_MESSAGE_PERSIST_ACK, async (_event, data: { ack: ImTypes.PersistAck; timestamp: number }) => {
        const messageStore = useMessageStore();
        let msg: IChatMessage | undefined;
        if (data.ack.ack_status === ImTypes.AckStatus.ACK_STATUS_FAILED) {
            msg = messageStore.updateMessageStatus(data.ack.session_id, '', data.ack.client_id, ImTypes.MessageStatus.MESSAGE_STATUS_FAILED, data.timestamp);
        } else if (data.ack.ack_status === ImTypes.AckStatus.ACK_STATUS_SUCCESS) {
            msg = messageStore.updateMessageStatus(data.ack.session_id, data.ack.msg_id, data.ack.client_id, ImTypes.MessageStatus.MESSAGE_STATUS_DELIVERED, data.timestamp, data.ack.seq);

            // 自己发出的消息持久化成功后，同步前进会话 max_seq 并回填 session_id，
            // 避免本地游标滞后于服务端 actual_seq 导致下次上线误判离线缺口
            if (msg?.sessionKey) {
                const sessionStore = useSessionStore();
                const updatedSession = sessionStore.upsertSession({
                    session_key: msg.sessionKey,
                    session_id: data.ack.session_id,
                    max_seq: data.ack.seq,
                });
                if (updatedSession) {
                    void sessionService.saveMany([toRaw(updatedSession)]);
                }
            }
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
