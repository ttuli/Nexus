import { getUserActiveConversation, updateConversation } from "@/src/apis/message"
import { useConversationStore } from "@/src/store/conversation"
import { getOfflineTimestamp } from "@/src/store/init"

class MessageService {
    async getOfflineActiveSessions() {
        const timestamp = getOfflineTimestamp()
        const res = await getUserActiveConversation({ timestamp })
        if (res.code === 200) {
            const conversationStore = useConversationStore()
            res.data.conversations.forEach(conversation => {
                conversationStore.upsertConversation(conversation)
            })
        }
    }

    async updateConversion(sessionId: string, isTop?: number, isDisturb?: number) {
        const conversationStore = useConversationStore()
        const chat = conversationStore.getChat(sessionId)
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
        conversationStore.sortChatList()
        try {
            await updateConversation({
                conversation_id: sessionId,
                is_top: Number(isTopVal),
                is_disturb: Number(isDisturbVal),
            })
        } catch (error) {
            console.error(error)
        }
    }
}

export const messageService = new MessageService()
export default messageService