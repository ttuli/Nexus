import { getUserActiveConversation, updateConversation } from "@/src/apis/message"
import { useSessionStore } from "@/src/store/session"
import { useMessageStore } from '@/src/store/message'
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
        const messgaeStore = useMessageStore()
        if (sessionStore.currentSessionKey === message.sessionKey) {
            messgaeStore.upsertMessage(message)
        }
        sessionStore.upsertSession({
            session_key: message.sessionKey as string,
            session_id: message.sessionId,
            max_seq: message.seq,
            last_content: getLastContent(message),
            last_sender: message.fromUserId,
            update_time: message.sendTime,
        })
        sessionStore.addOrPinToTop(message.sessionKey as string)
        sessionStore.incrementUnread(message.sessionKey as string)
        // 使用 JSON 序列化剥离 Vue Proxy，防止 IPC structured clone 报错
        const res = await ipcService.invoke(IpcChannels.MSG_SAVE, JSON.parse(JSON.stringify(message)));
        if (!res.success) throw new Error(res.error ?? `IPC call failed: ${IpcChannels.MSG_SAVE}`);
    }
}

export const messageService = new MessageService();

export default messageService;