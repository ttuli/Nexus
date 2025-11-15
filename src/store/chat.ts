import { defineStore } from 'pinia'
import { reactive, watch } from 'vue'
import { ChatListInfo } from '@/models/chat'
import { ChatMessage, MessageStatus, MsgType, WsMessage } from '@/models/message'
import { getSessionId } from '@/utils/sessionId'
import { ElMessage } from 'element-plus'
import { getSessionMsg } from '@/apis/social'
import { sqlJsDB } from '@/utils/sqljs'
import { useUserStore } from '@/store/user'

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
    _selectedWatcherInited: false as boolean,
  }),
  actions: {
    async loadAllCaches() {
      const owner = useUserStore().userInfo.user_id?.toString() || undefined
      const now = Date.now()
      const rows = sqlJsDB.getSessionsWithMeta(owner, now)
      rows.forEach((row: { sessionId: string, data: any[] }) => {
        const sid = row.sessionId
        if (!sid) return
        if (!this.chatMsgs.has(sid)) this.chatMsgs.set(sid, [])
        const parts = sid.split('_')
        let type: 'friend' | 'group' = parts.length === 2 ? 'friend' : 'group'
        let id: bigint
        if (type === 'friend') {
          const my = useUserStore().userInfo.user_id
          const a = BigInt(parts[0])
          const b = BigInt(parts[1])
          id = a === my ? b : a
        } else {
          id = BigInt(sid)
        }
        if (!this.chats.some(c => c.session_id === sid)) {
          this.addChat({
            id,
            session_id: sid,
            unreadCount: 0,
            lastMessage: '',
            lastMessageTime: 0,
            type
          })
        }
        const arr = Array.isArray(row.data) ? row.data : []
        arr.forEach((item: any) => {
          const ws: WsMessage = {
            id: String(item.id ?? item.ID ?? ''),
            session_id: String(item.session_id ?? item.SessionID ?? sid),
            seq_id: Number(item.seq_id ?? item.SeqID ?? 0),
            msgType: Number(item.type ?? item.Type ?? MsgType.Text) as MsgType,
            timestamp: Number(item.timestamp ?? item.Timestamp ?? Date.now()),
            content: String(item.content ?? item.Content ?? ''),
            status: Number(item.status ?? item.Status ?? MessageStatus.Delivered) as MessageStatus,
            sender_id: BigInt(item.sender_id ?? item.SenderID ?? 0),
          }
          this.parseWsMessage(ws)
        })
      })
    },
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
    },
    /**
     * 自动监听选中会话变化：
     * 1) 从本地缓存加载（如无则插入空记录）；
     * 2) 再从服务器拉取历史并写入消息列表。
     */
    initSelectedChatWatcher() {
      if (this._selectedWatcherInited) return
      this._selectedWatcherInited = true
      const normalizeHistoryPayload = (payload: any): any[] => {
        const root = payload?.data ?? payload
        const arr = root?.data ?? root
        if (Array.isArray(arr)) return arr
        if (!arr) return []
        if (typeof arr === 'object') return Object.values(arr)
        return []
      }
      watch(() => this.selectedChat?.session_id || '', async (sid) => {
        if (!sid) return
        if (!this.chatMsgs.has(sid)) this.chatMsgs.set(sid, [])
        const owner = useUserStore().userInfo.user_id.toString()
        const now = Date.now()
        // 从本地加载；如无则插入空记录
        try {
          const local = sqlJsDB.getSession(owner, sid, now)
          if (Array.isArray(local) && local.length > 0) {
            for (const item of local) {
              const ws: WsMessage = {
                id: String(item.id ?? item.ID ?? ''),
                session_id: String(item.session_id ?? item.SessionID ?? sid),
                seq_id: Number(item.seq_id ?? item.SeqID ?? 0),
                msgType: Number(item.type ?? item.Type ?? MsgType.Text) as MsgType,
                timestamp: Number(item.timestamp ?? item.Timestamp ?? Date.now()),
                content: String(item.content ?? item.Content ?? ''),
                status: Number(item.status ?? item.Status ?? MessageStatus.Delivered) as MessageStatus,
                sender_id: BigInt(item.sender_id ?? item.SenderID ?? 0),
              }
              this.parseWsMessage(ws)
            }
          } else {
            sqlJsDB.saveSessions([{ ownerId: owner, sessionId: sid, data: [], updatedAt: now, expiresAt: now + 30 * 24 * 60 * 60 * 1000 }])
          }
        } catch (e) {
          console.log(e)
        }
        // 服务器历史拉取
        try {
          const existing = this.chatMsgs.get(sid) || []
          const lastSeq = existing.length ? existing[existing.length - 1].seqid : 0
          const fromSeq = Math.max(0, lastSeq - 500)
          const endSeq = Number.MAX_SAFE_INTEGER
          const res = await getSessionMsg({ sessionId: sid, fromSeq, endSeq })
          const list = normalizeHistoryPayload(res)
          for (const item of list) {
            const ws: WsMessage = {
              id: String(item.id ?? item.ID ?? ''),
              session_id: String(item.session_id ?? item.SessionID ?? sid),
              seq_id: Number(item.seq_id ?? item.SeqID ?? 0),
              msgType: Number(item.type ?? item.Type ?? MsgType.Text) as MsgType,
              timestamp: Number(item.timestamp ?? item.Timestamp ?? Date.now()),
              content: String(item.content ?? item.Content ?? ''),
              status: Number(item.status ?? item.Status ?? MessageStatus.Delivered) as MessageStatus,
              sender_id: BigInt(item.sender_id ?? item.SenderID ?? 0),
            }
            this.parseWsMessage(ws)
          }
        } catch (e) {
          console.log(e)
        }
      }, { immediate: true })
    }
  }
})
