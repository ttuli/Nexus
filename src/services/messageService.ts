import { getUserActiveConversation, updateConversation } from "@/src/apis/message"
import { useChatStore } from "@/src/store/chat"
import { getOfflineTimestamp } from "@/src/store/init"

class MessageService {
    async getOfflineActiveSessions() {
        const timestamp = getOfflineTimestamp()
        const res = await getUserActiveConversation({ timestamp })
        if (res.code === 200) {
            const chatStore = useChatStore()
            res.data.conversations.forEach(conversation => {
                chatStore.upsertConversation(conversation)
            })
        }
    }

    async updateConversion(sessionId: string, isTop?: number, isDisturb?: number) {
        const chatStore = useChatStore()
        const chat = chatStore.getChat(sessionId)
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
        chatStore.sortChatList()
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