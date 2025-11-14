
export enum MessageStatus {
  Sending = 1, // 发送中
  Sent = 2,       // 已发送
  Delivered = 3,
  Failed = 4    // 发送失败
} // 对应 message.MessageStatus
export enum MsgType {
  Text = 1,   // TypeText
  Image = 2,  // TypeImage
  File = 3,   // TypeFile
  Audio = 4,  // TypeAudio
  Video = 5,   // TypeVideo
  System = 6,
  Heartbeat = 7,
}

export interface ChatMessage {
  id:string,
  sessionId:string,
  seqid: number
  msgType: MsgType
  timestamp: number
  content: string
  sender_id?: bigint
  status: MessageStatus
}


export interface WsMessage {
  // 基础元信息
  id: string          // ClientID
  msgType?: MsgType    // 消息具体类型
  session_id?: string // 会话ID（仅聊天消息有）
  sender_id?: bigint  // 发送者
  seq_id?: number     // 消息序列号（仅聊天消息有）
  receivers?: bigint[] // 接收者（群聊或单聊）
  timestamp: number    // 发送时间（毫秒）

  // 业务内容
  content: string                 // 文本内容
  status?: MessageStatus           // 当前消息状态（可选）
  extra?: { [key: string]: any }  // 扩展字段（如图片URL、@信息等）

  // 控制字段（心跳/ACK用）
  error?: string                   // 若是错误消息，填错误原因
}
