import { getUserActiveConversation, updateConversation } from "@/src/apis/message"
import { useSessionStore } from "@/src/store/session"
import { useMessageStore } from '@/src/store/message'
import { useUserStore } from '@/src/store/user'
import { getOfflineTimestamp } from "@/src/store/init"
import { IChatMessage } from '@shared/types/chatMessage';
import { IpcChannels } from '@shared/types/ipc';
import { ipcService } from './ipcService';
import { sessionService } from './sessionService';
import { getLastContent } from "../utils/messageConverter";
import windowService, { NotifySoundType } from "./windowService"

class MessageService {
    // ─────────────────────────────────────────────
    //  会话（Session）相关
    // ─────────────────────────────────────────────

    async getOfflineActiveSessions() {
        const timestamp = getOfflineTimestamp()
        const res = await getUserActiveConversation({ timestamp })
        if (res.code === 200) {
            const sessionStore = useSessionStore()
            const updatedSessions: any[] = [];
            res.data.sessions.forEach(ss => {
                const updated = sessionStore.upsertSession(ss)
                if (updated) updatedSessions.push(JSON.parse(JSON.stringify(updated)));
            })
            if (updatedSessions.length > 0) {
                void sessionService.saveMany(updatedSessions);
            }
        }
    }

    async updateConversion(sessionId: string, isTop?: number, isDisturb?: number) {
        const sessionStore = useSessionStore()
        const chat = sessionStore.getSession(sessionId)
        if (!chat) {
            return
        }
        if (isTop === undefined && isDisturb === undefined) {
            return
        }
        let isTopVal = isTop ?? chat.is_top
        let isDisturbVal = isDisturb ?? chat.is_disturb
        chat.is_top = isTopVal
        chat.is_disturb = isDisturbVal
        sessionStore.sortSessionList()
        try {
            await updateConversation({
                session_id: sessionId,
                is_top: Number(isTopVal),
                is_disturb: Number(isDisturbVal),
            })
        } catch (error) {
            console.error(error)
        }
    }

    // ─────────────────────────────────────────────
    //  消息持久化（原 MessageStorageService）
    // ─────────────────────────────────────────────

    /**
     * 保存单条消息（upsert）
     */
    async saveMessage(message: IChatMessage): Promise<void> {
        const sessionStore = useSessionStore()
        const messageStore = useMessageStore()
        if (sessionStore.currentSessionKey === message.sessionKey) {
            messageStore.upsertMessage(message)
        }
        // upsertSession 内部会自动处理新会话插入以及已有会话的排序置顶
        const updatedSession = sessionStore.upsertSession({
            session_key: message.sessionKey as string,
            session_id: message.sessionId,
            max_seq: message.seq,
            last_content: getLastContent(message),
            last_sender: message.fromUserId,
            update_time: message.sendTime,
        })
        if (updatedSession) {
            void sessionService.saveMany([JSON.parse(JSON.stringify(updatedSession))]);
        }
        // 仅对接收方（非自己）的消息增加未读计数
        const userStore = useUserStore();
        if (message.fromUserId !== userStore.userID) {
            sessionStore.incrementUnread(message.sessionKey as string)
            windowService.playNotificationSound(NotifySoundType.Message);
        }
        // 使用 JSON 序列化剥离 Vue Proxy，防止 IPC structured clone 报错
        const res = await ipcService.invoke(IpcChannels.MSG_SAVE, JSON.parse(JSON.stringify(message)));
        if (!res.success) throw new Error(res.error ?? `IPC call failed: ${IpcChannels.MSG_SAVE}`);
    }
    /**
     * 批量保存消息（upsert many）
     */
    async saveMessages(messages: IChatMessage[]): Promise<void> {
        if (messages.length === 0) return;
        const res = await ipcService.invoke(IpcChannels.MSG_SAVE_MANY, messages.map(m => JSON.parse(JSON.stringify(m))));
        if (!res.success) {
            console.error('[MessageService] saveMessages failed:', res.error);
        }
    }

    /**
     * 从本地 SQLite 拉取历史消息
     * @param sessionKey  会话 session_key（本地标识，如 private_123_456）
     * @param beforeSeq   排他性上界：只返回 seq < beforeSeq 的消息；传 Number.MAX_SAFE_INTEGER 表示从最新开始
     * @param limit       最多返回条数
     */
    async getLocalHistoryMessages(sessionKey: string, beforeSeq: number, limit: number): Promise<IChatMessage[]> {
        const res = await ipcService.invoke<IChatMessage[]>(
            IpcChannels.MSG_GET_HISTORY,
            sessionKey,
            beforeSeq,
            limit,
        );
        if (res.success && Array.isArray(res.data)) {
            return res.data;
        }
        return [];
    }

    /**
     * 清除指定会话的全部本地消息记录
     */
    async clearMessagesBySessionId(sessionId: string): Promise<void> {
        const res = await ipcService.invoke(IpcChannels.MSG_CLEAR_SESSION, sessionId);
        if (!res.success) {
            console.error('[MessageService] clearMessagesBySessionId failed:', res.error);
        }
    }

    // ─────────────────────────────────────────────
    //  消息加载（原 MessageStore.loadMoreMessages）
    // ─────────────────────────────────────────────

    /**
     * 加载更多历史消息（分页游标式）。
     *
     * 职责：
     * 1. 优先从本地 SQLite 读取；本地未命中时回源到远端 API。
     * 2. 读取后将消息写入 messageStore，并同步更新 sessionStore 的摘要字段。
     * 3. 管理 messageStore 的 isLoading / hasMore 状态。
     *
     * @returns 本次加载到的消息列表（空表示没有更多）
     */
    async loadMoreMessages(): Promise<IChatMessage[]> {
        const sessionStore = useSessionStore();
        const messageStore = useMessageStore();
        const currentSessionKey = sessionStore.currentSessionKey;

        if (messageStore.isLoading || !messageStore.hasMore || !currentSessionKey) return [];

        // 取列表中最顶端（最旧）的、具有有效 seq 的消息作为游标。
        // 若顶端消息尚无有效 seq（即本地发送中、ACK 未回），说明当前列表
        // 中没有任何已确认的历史消息，无需发起任何请求。
        const oldestConfirmedSeq = (() => {
            for (const msg of messageStore.messages) {
                const seq = Number(msg.seq);
                if (Number.isFinite(seq) && seq > 0) return seq;
            }
            return null;
        })();

        if (messageStore.messages.length > 0 && oldestConfirmedSeq === null) {
            // 列表非空，但所有消息都是本地 pending 状态，直接判定无历史可拉
            messageStore.hasMore = false;
            return [];
        }

        messageStore.isLoading = true;
        try {
            // beforeSeq 为 null 时表示首次加载（列表为空），传 undefined 给 chatService
            // 动态导入打破 chatService ↔ messageService 循环依赖
            const { chatService } = await import('./chatService');
            const moreMessages = await chatService.getHistoryMessages(
                currentSessionKey,
                oldestConfirmedSeq ?? undefined,
                messageStore.pageSize
            );

            // 会话已切换，丢弃结果
            if (sessionStore.currentSessionKey !== currentSessionKey) {
                return [];
            }

            if (moreMessages.length > 0) {
                messageStore.messages.unshift(...moreMessages);

                // 获取消息后更新对应会话的 last_content 等信息
                const cur = sessionStore.sessionList.find((c: any) => c.session_key === currentSessionKey);
                if (cur && messageStore.messages.length > 0) {
                    const latestMsg = messageStore.messages[messageStore.messages.length - 1];
                    if (latestMsg) {
                        cur.last_content = getLastContent(latestMsg);
                        cur.last_message_time = latestMsg.sendTime;
                        if (latestMsg.fromUserId) {
                            cur.last_sender = latestMsg.fromUserId;
                        }
                    }
                }
            }

            // 返回条数不足一页，则视为没有更多历史
            if (moreMessages.length < messageStore.pageSize) {
                messageStore.hasMore = false;
            }

            return moreMessages;
        } catch (e) {
            console.error('[MessageService] loadMoreMessages failed:', e);
            return [];
        } finally {
            if (sessionStore.currentSessionKey === currentSessionKey) {
                messageStore.isLoading = false;
            }
        }
    }
}

export const messageService = new MessageService();

export default messageService;