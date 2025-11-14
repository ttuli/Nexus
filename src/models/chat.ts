interface ChatListInfo {
  id: bigint
  session_id:string
  unreadCount: number
  lastMessage: string
  lastMessageTime: number
  type: 'friend' | 'group'
}

export type {
    ChatListInfo
}