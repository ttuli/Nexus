import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { ChatListInfo } from '@/models/chat'
import { ChatMessage, MessageStatus, MsgType, WsMessage } from '@/models/message'
import { getSessionId } from '@/utils/sessionId'
import { ElMessage } from 'element-plus'

const MAX_PER_SESSION = 1000
const SEND_FAIL_MS = 10000

function findInsertIndex(list: ChatMessage[], seqid: number): number {
  let low = 0
  let high = list.length
  while (low < high) {
    const mid = (low + high) >> 1
    if (list[mid].seqid <= seqid) {
      low = mid + 1
    } else {
      high = mid
    }
  }
  return low
}

export const useChatStore = defineStore('chat', {
  state: () => ({
    chats: reactive<ChatListInfo[]>([]),
    chatMsgs: reactive(new Map<string, ChatMessage[]>()),
    selectedChat: null as ChatListInfo | null,
    sendingMap: reactive(new Map<string, { sessionId: string, deadline: number }>()),
    sendingSchedulerId: null as number | null,
  }),
  actions: {
    initSendingScheduler() {
      if (this.sendingSchedulerId !== null) return
      this.sendingSchedulerId = setInterval(() => {
        const now = Date.now()
        this.sendingMap.forEach((meta, messageId) => {
          if (meta.deadline <= now) {
            const list = this.chatMsgs.get(meta.sessionId)
            if (list) {
              const idx = list.findIndex((m) => m.id === messageId)
              if (idx !== -1 && list[idx].status === MessageStatus.Sending) {
                list[idx].status = MessageStatus.Failed
                ElMessage.error('消息发送失败')
              }
            }
            this.sendingMap.delete(messageId)
          }
        })
      }, 1000) as unknown as number
    },
    setActiveChat(chatId: bigint, type: string) {
      if (!this.chats.some((c) => c.id === chatId)) {
        this.addChat({
          id: chatId,
          unreadCount: 0,
          lastMessage: '',
          lastMessageTime: 0,
          session_id: getSessionId(type as 'friend' | 'group', chatId),
          type: type as 'friend' | 'group',
        })
      }
      this.selectedChat = this.chats.find((c) => c.id === chatId) || null
    },
    addChat(chat: ChatListInfo) {
      this.chats.unshift(chat)
    },
    getChat(id: bigint) {
      return this.chats.find((c) => c.id === id)
    },
    parseWsMessage(msg: WsMessage) {
      if (msg.msgType === MsgType.Heartbeat) return
      if (!this.chatMsgs.has(msg.session_id || '')) {
        this.chatMsgs.set(msg.session_id || '', [])
      }
      let s = this.chatMsgs.get(msg.session_id as string)
      if (!s) return
      if (msg.status === MessageStatus.Sending) {
        this.initSendingScheduler()
        const sessionId = msg.session_id as string
        const messageId = msg.id as string
        this.sendingMap.set(messageId, { sessionId, deadline: Date.now() + SEND_FAIL_MS })
      }
      const existsIndex = s.findIndex((m) => m.id === msg.id)
      if (existsIndex === -1) {
        const newMsg: ChatMessage = {
          id: msg.id || '',
          sessionId: msg.session_id as string,
          seqid: msg.seq_id as number,
          msgType: msg.msgType as MsgType,
          timestamp: msg.timestamp,
          content: msg.content,
          sender_id: msg.sender_id,
          status: msg.status as MessageStatus,
        }
        if (s.length === 0 || msg.seq_id === undefined || (msg.seq_id as number) >= s[s.length - 1].seqid) {
          s.push(newMsg)
        } else {
          const insertIdx = findInsertIndex(s, msg.seq_id as number)
          s.splice(insertIdx, 0, newMsg)
        }
        if (s.length > MAX_PER_SESSION) {
          s.splice(0, s.length - MAX_PER_SESSION)
        }
        if (msg.status !== MessageStatus.Sending) {
          this.sendingMap.delete(msg.id || '')
        }
      } else {
        const index = s.findIndex((m) => m.id === msg.id)
        if (index !== -1) {
          s[index] = {
            id: msg.id || '',
            sessionId: msg.session_id as string,
            seqid: msg.seq_id as number,
            msgType: msg.msgType as MsgType,
            timestamp: msg.timestamp,
            content: msg.content,
            sender_id: BigInt(msg.sender_id as bigint),
            status: msg.status as MessageStatus,
          }
          if (msg.status !== MessageStatus.Sending) {
            this.sendingMap.delete(msg.id || '')
          }
        }
      }
      this.chats.forEach((c) => {
        if (c.session_id === msg.session_id) {
          c.lastMessage = msg.content || ''
          c.lastMessageTime = msg.timestamp || 0
          if (c.session_id !== this.selectedChat?.session_id) {
            c.unreadCount++
          }
        }
      })
    }
  }
})
