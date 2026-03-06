import { getUserActiveConversation } from "@/apis/message"
import { useChatStore } from "@/store/chat"
import { getOfflineTimestamp } from "@/store/init"

class MessageService {
    async getOfflineActiveSessions() {
        const timestamp = getOfflineTimestamp()
        const res = await getUserActiveConversation({ timestamp })
        console.log(res)
        if (res.code === 200) {
            const chatStore = useChatStore()
            res.data.conversations.forEach(conversation => {
                chatStore.upsertConversation(conversation)
            })
        }
    }
}

export const messageService = new MessageService()
export default messageService