import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { ChatListInfo } from '@/models/chat'
import { ChatMessage, MessageStatus, MsgType, WsMessage } from '@/models/message'
import { getSessionId } from '@/utils/sessionId'
import { ElMessage } from 'element-plus'
import { getSessionMsg } from '@/apis/social'
import { sqlJsDB } from '@/utils/sqljs'
import { useUserStore } from '@/store/user'

export const MAX_SESSION_NUM = 30
export const MAX_PER_SESSION = 1000
const SEND_FAIL_MS = 10000

function findInsertIndex(list: ChatMessage[], seqid?: number, ts?: number): number {
  if (typeof seqid === 'number' && !Number.isNaN(seqid)) {
    let low = 0
    let high = list.length
    while (low < high) {
      const mid = (low + high) >> 1
      if ((list[mid].seqid as number) <= (seqid as number)) {
        low = mid + 1
      } else {
        high = mid
      }
    }
    return low
  }
  if (typeof ts === 'number' && !Number.isNaN(ts)) {
    let low = 0
    let high = list.length
    while (low < high) {
      const mid = (low + high) >> 1
      const mts = Number(list[mid].timestamp || 0)
      if (mts <= ts) {
        low = mid + 1
      } else {
        high = mid
      }
    }
    return low
  }
  return list.length
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
      const rows = sqlJsDB.getSession(useUserStore().userInfo.user_id?.toString())
      if (rows) {
        rows.forEach((row: any) => {
          this.chats.push({
            id: BigInt(row.data.id),
            session_id: row.data.session_id,
            unreadCount: row.data.unreadCount,
            lastMessage: row.data.lastMessage,
            lastMessageTime: row.data.lastMessageTime,
            type: row.data.type,
          })
        })

      }
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
      this.GetChatMessageBySelected()
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
      if (!this.chats.some((c) => c.session_id === (msg.session_id as string))) {
        const sid = String(msg.session_id || '')
        let type: 'friend' | 'group'
        let cid: bigint
        if (sid.indexOf('_') !== -1) {
          const a = BigInt(sid.split('_')[0])
          const b = BigInt(sid.split('_')[1])
          const me = useUserStore().userInfo.user_id
          cid = a === me ? b : a
          type = 'friend'
        } else {
          cid = BigInt(sid)
          type = 'group'
        }
        this.addChat({ id: cid, session_id: sid, unreadCount: 0, lastMessage: '', lastMessageTime: 0, type })
      }
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
            if (!document.hasFocus()) {
              try {
                const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
                const osc = ctx.createOscillator()
                const gain = ctx.createGain()
                osc.type = 'sine'
                osc.frequency.value = 880
                osc.connect(gain)
                gain.connect(ctx.destination)
                gain.gain.setValueAtTime(0.0001, ctx.currentTime)
                gain.gain.exponentialRampToValueAtTime(0.1, ctx.currentTime + 0.02)
                osc.start()
                setTimeout(() => {
                  try {
                    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18)
                    osc.stop()
                  } finally {
                    ctx.close()
                  }
                }, 200)
              } catch { }
            }
            const idx = this.chats.findIndex((x) => x.session_id === msg.session_id)
            if (idx > 0) {
              const [chat] = this.chats.splice(idx, 1)
              this.chats.unshift(chat)
            }
          }
        }
      })
      try {
        const sid = msg.session_id as string
        const list = this.chatMsgs.get(sid) || []
        const saved = list.find(m => m.id === (msg.id || ''))
        if (saved) {
          sqlJsDB.saveChats([{ id: saved.id, sessionId: sid, seq: saved.seqid, data: { ...saved } }])
        }
      } catch { }
      this.ensureGlobalMessageLimit()
    },
    async loadMoreHistory(sessionId: string) {
      if (!sessionId) return
      const existing = this.chatMsgs.get(sessionId) || []
      const earliest = existing.length ? existing[0].seqid : 0
      if (earliest === 1) return
      const endSeq = earliest > 1 ? earliest - 1 : 0
      if (endSeq <= 0) return
      const fromSeq = Math.max(1, endSeq - 500)
      const local = sqlJsDB.getChats(sessionId, fromSeq, endSeq)
      const localList = Array.isArray(local) ? local[local.length - 1] || [] : []
      if (Array.isArray(localList) && localList.length > 0) {
        for (const m of localList) {
          const ws: WsMessage = {
            id: String(m.id || ''),
            session_id: String(m.sessionId || sessionId),
            seq_id: Number(m.seqid || 0),
            msgType: Number(m.msgType || MsgType.Text) as MsgType,
            timestamp: Number(m.timestamp || Date.now()),
            content: String(m.content || ''),
            status: Number(m.status || MessageStatus.Delivered) as MessageStatus,
            sender_id: BigInt(m.sender_id || 0),
          }
          this.parseWsMessage(ws)
        }
        return
      }
      const normalizeHistoryPayload = (payload: any): any[] => {
        const root = payload?.data ?? payload
        const arr = root?.data ?? root
        if (Array.isArray(arr)) return arr
        if (!arr) return []
        if (typeof arr === 'object') return Object.values(arr)
        return []
      }
      try {
        const res = await getSessionMsg({ sessionId, fromSeq, endSeq })
        const list = normalizeHistoryPayload(res)
        for (const item of list) {
          const ws: WsMessage = {
            id: String(item.id ?? item.ID ?? ''),
            session_id: String(item.session_id ?? item.SessionID ?? sessionId),
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
    },
    async GetChatMessageBySelected() {
      console.log('GetChatMessageBySelected')
      const normalizeHistoryPayload = (payload: any): any[] => {
        const root = payload?.data ?? payload
        const arr = root?.data ?? root
        if (Array.isArray(arr)) return arr
        if (!arr) return []
        if (typeof arr === 'object') return Object.values(arr)
        return []
      }
      const chat = this.selectedChat
      if (!chat)
        return
      try {
        const local = sqlJsDB.getChats(chat.session_id || '')
        if (Array.isArray(local) && local.length > 0) {
          const s = this.chatMsgs.get(chat.session_id || '') || []
          const m = local[local.length - 1]
          if (!m || m.length === 0) return
          console.log(m)
          if (Array.isArray(m)) {
            m.forEach((item: any) => {
              if (!item) return

              const msg = {
                id: item.id || '',
                content: item.content || '',
                msgType: item.msgType || MsgType.Text,
                seqid: item.seqid || 0,
                timestamp: item.timestamp || Date.now(),
                sender_id: BigInt(item.sender_id || 0),
                status: item.status || MessageStatus.Delivered,
                sessionId: item.sessionId || '',
              }
              if (s.some((m) => m.id === msg.id)) return
              const insertIdx = findInsertIndex(s, Number(item.seqid), Number(item.timestamp))
              s.splice(insertIdx, 0, msg)
            })
          } else {
            if (s.some((m) => m.id === msg.id)) return
            const item = m
            const msg = {
              id: item.id || '',
              content: item.content || '',
              msgType: item.msgType || MsgType.Text,
              seqid: item.seqid || 0,
              timestamp: item.timestamp || Date.now(),
              sender_id: BigInt(item.sender_id || 0),
              status: item.status || MessageStatus.Delivered,
              sessionId: item.sessionId || '',
            }
            const insertIdx = findInsertIndex(s, Number(item.seqid), Number(item.timestamp))
            s.splice(insertIdx, 0, msg)
          }
          this.chatMsgs.set(chat.session_id || '', s)
        } else {
          const existing = this.chatMsgs.get(chat.session_id || '') || []
          const lastSeq = existing.length ? existing[existing.length - 1].seqid : 0
          const fromSeq = Math.max(0, lastSeq - 500)
          const endSeq = Number.MAX_SAFE_INTEGER
          const res = await getSessionMsg({ sessionId: chat.session_id || '', fromSeq, endSeq })
          const list = normalizeHistoryPayload(res)
          for (const item of list) {
            const ws: WsMessage = {
              id: String(item.id ?? item.ID ?? ''),
              session_id: String((item.session_id ?? item.SessionID ?? chat.session_id) || ''),
              seq_id: Number(item.seq_id ?? item.SeqID ?? 0),
              msgType: Number(item.type ?? item.Type ?? MsgType.Text) as MsgType,
              timestamp: Number(item.timestamp ?? item.Timestamp ?? Date.now()),
              content: String(item.content ?? item.Content ?? ''),
              status: Number(item.status ?? item.Status ?? MessageStatus.Delivered) as MessageStatus,
              sender_id: BigInt(item.sender_id ?? item.SenderID ?? 0),
            }
            this.parseWsMessage(ws)
          }
        }
      } catch (e) {
        console.log(e)
      }
    },
    ensureGlobalMessageLimit() {
      let total = 0
      const entries: { sid: string, idx: number, ts: number }[] = []
      this.chatMsgs.forEach((list, sid) => {
        total += list.length
        for (let i = 0; i < list.length; i++) {
          const m = list[i]
          entries.push({ sid, idx: i, ts: Number(m.timestamp || 0) })
        }
      })
      if (total <= MAX_PER_SESSION) return
      const overflow = total - MAX_PER_SESSION
      entries.sort((a, b) => a.ts - b.ts)
      const toRemove = entries.slice(0, overflow)
      const groups = new Map<string, number[]>()
      toRemove.forEach((e) => {
        const arr = groups.get(e.sid) || []
        arr.push(e.idx)
        groups.set(e.sid, arr)
      })
      groups.forEach((idxs, sid) => {
        const list = this.chatMsgs.get(sid) || []
        idxs.sort((a, b) => b - a)
        idxs.forEach((i) => {
          if (i >= 0 && i < list.length) list.splice(i, 1)
        })
      })
    }
  }
})
