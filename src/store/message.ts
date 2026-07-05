import { defineStore } from 'pinia';
import { useSessionStore } from './session';
import { IChatMessage } from '@/src/types/chatMessage';
export const useMessageStore = defineStore('message', {
    state: () => ({
        messages: [] as IChatMessage[],
        isLoading: false,
        hasMore: true,
        pageSize: 20
    }),
    actions: {
        /**
         * 更新文件消息的本地路径（下载完成后使用）
         */
        updateFileLocalPath(sessionkey: string, msgId: string, localPath: string) {
            const conversationStore = useSessionStore();
            if (conversationStore.currentSessionKey !== sessionkey) return;
            const msg = this.messages.find(m =>
                (msgId && m.msgId === msgId)
            ) as any;
            if (msg) {
                msg.localPath = localPath;
            }
        },

        /**
         * 重置当前会话消息状态
         */
        resetMessageState() {
            this.messages = [];
            this.isLoading = false;
            this.hasMore = true;
        },

        /**
         * 更新消息状态（供 Listener 更新服务端返回的 ack / recall 状态使用）
         * @param sessionId  用于日志，不参与查找（查找走 clientId / msgId）
         * @param clientId   本地生成的 clientId
         * @param status     新状态值
         * @param sendTime   可选，服务端确认时间（PersistAck 里有）
         * @param msgId      可选，服务端分配的 msgId（ACK 回填用）
         * @param seq        可选，服务端分配的 seq
         */
        updateMessageStatus(
            _sessionId: string,
            clientId: string,
            status: number,
            sendTime?: number,
            msgId?: string,
            seq?: number
        ): IChatMessage | undefined {
            const msg = this.messages.find(m =>
                (clientId && m.clientId === clientId) ||
                (msgId && m.msgId === msgId)
            );
            if (msg) {
                msg.status = status;
                if (sendTime) msg.sendTime = sendTime;
                if (msgId) msg.msgId = msgId;
                if (seq) msg.seq = seq;
                if (_sessionId) msg.sessionId = _sessionId;
            }
            return msg;
        },

        /**
         * 添加或更新消息，返回 store 内的消息引用（响应式）
         */
        upsertMessage(message: IChatMessage): IChatMessage {
            const existing = this.messages.find(m =>
                (message.clientId && message.clientId === m.clientId) ||
                (message.msgId && message.msgId === m.msgId)
            );
            if (!existing) {
                this.messages.push(message);
                // 返回刚插入的那一条（push 后末尾）
                return this.messages[this.messages.length - 1];
            } else {
                existing.seq = message.seq || existing.seq;
                existing.msgId = message.msgId || existing.msgId;
                existing.status = message.status || existing.status;
                existing.sendTime = message.sendTime || existing.sendTime;
                return existing;
            }
        }
    }
});
