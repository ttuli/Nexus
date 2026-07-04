import { getUserActiveConversation, updateConversation } from "@/src/apis/message"
import { useSessionStore } from "@/src/store/session"
import { useMessageStore } from '@/src/store/message'
import { useUserStore } from '@/src/store/user'
import { getOfflineTimestamp } from "@/src/store/init"
import { IChatMessage } from '@/src/types/chatMessage';
import { IpcChannels } from '@/src/types/ipc';
import { ipcService } from './ipcService';
import { getLastContent } from "../utils/messageConverter";

class MessageService {
    // ─────────────────────────────────────────────
    //  会话（Session）相关
    // ─────────────────────────────────────────────

    async getOfflineActiveSessions() {
        const timestamp = getOfflineTimestamp()
        const res = await getUserActiveConversation({ timestamp })
        if (res.code === 200) {
            const conversationStore = useSessionStore()
            res.data.sessions.forEach(ss => {
                conversationStore.upsertSession(ss)
            })
        }
    }

    async updateConversion(sessionId: string, isTop?: number, isDisturb?: number) {
        const conversationStore = useSessionStore()
        const chat = conversationStore.getSession(sessionId)
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
        conversationStore.sortSessionList()
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
        sessionStore.upsertSession({
            session_key: message.sessionKey as string,
            session_id: message.sessionId,
            max_seq: message.seq,
            last_content: getLastContent(message),
            last_sender: message.fromUserId,
            update_time: message.sendTime,
        })
        // 仅对接收方（非自己）的消息增加未读计数
        const userStore = useUserStore();
        if (message.fromUserId !== userStore.userID) {
            sessionStore.incrementUnread(message.sessionKey as string)
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
     * @param sessionId  会话 ID
     * @param maxSeq     最大序列号上界（inclusive）；传 Number.MAX_SAFE_INTEGER 表示不限
     * @param limit      最多返回条数
     */
    async getLocalHistoryMessages(sessionId: string, maxSeq: number, limit: number): Promise<IChatMessage[]> {
        const res = await ipcService.invoke<IChatMessage[]>(IpcChannels.MSG_GET_HISTORY, {
            session_id: sessionId,
            max_seq: maxSeq,
            limit,
        });
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
}

export const messageService = new MessageService();

export default messageService;