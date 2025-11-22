import { WsConfig, wsConfig } from "@/configs/wsConfig"
import { ApplyMsg, MsgType, WsMessage } from "@/models/message"
import { useUserStore } from "@/store/user"
import { useChatStore } from "@/store/chat"
import { ElMessage } from "element-plus"
import JSONBIGINT from 'json-bigint'
import { useApplyStore } from "@/store/apply"
import { ApplyStatus } from "@/models/social"
import { useContactStore } from "@/store/contact"

class WebSocketClient {
    private ws: WebSocket | null = null
    private wsconfig: WsConfig | null = null
    private messageQueue: WsMessage[] = []
    private reconnectTimer: number | null = null
    private heartbeatTimer: number | null = null
    private needReconnect: boolean = true

    constructor(c: WsConfig) {
        this.wsconfig = c
    }
    connect() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) return
        this.ws = new WebSocket(`${this.wsconfig?.url}?token=${useUserStore().token}`)
        this.registerHandler()
        this.ws.onopen = () => {
            this.flushQueue()
            this.startHeartbeat()
        }
    }
    private send(msg: WsMessage) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSONBIGINT.stringify(msg))
        } else {
            // 连接未就绪，先入队
            this.messageQueue.push(msg)
        }
    }
    close() {
        this.needReconnect = false
        this.stopHeartbeat()
        if (this.ws) {
            this.ws.close()
            this.ws = null
        }
    }

    private flushQueue() {
        this.messageQueue.forEach(msg => this.send(msg))
        this.messageQueue = []
    }
    private registerHandler() {
        if (!this.ws) return
        this.ws.onmessage = async (event) => {
            let text = event.data
            if (event.data instanceof Blob) {
                text = await event.data.text()
            }
            console.log("收到消息:", text)

            const msg = JSONBIGINT.parse(text) as WsMessage
            if (msg.msgType === MsgType.ApplyUpdate) {
                const applyMsg = msg.extra?.apply as ApplyMsg
                useApplyStore().ApplyUpdate(applyMsg)
                if (applyMsg.status === ApplyStatus.Accepted) {
                    if (applyMsg.type === 'group') {
                        useContactStore().AddGroup(applyMsg.relation_id)
                    } else {
                        useContactStore().setFriend({
                            user_id: applyMsg.relation_id,
                            remark: '',
                        })
                    }
                }
                return
            }
            useChatStore().parseWsMessage(msg)
        }
        this.ws.onerror = (err) => {
            ElMessage.error("连接服务器失败,请检测网络")
            console.error("[WebSocket] error:", err)
        }
        this.ws.onclose = (event) => {
            console.log("[WebSocket] 连接关闭:", event)
            this.stopHeartbeat()
            if (this.needReconnect) {
                this.reconnect()
            }
        }
    }
    private startHeartbeat() {
        this.heartbeatTimer = window.setInterval(() => {
            this.send({
                id: '',
                msgType: MsgType.Heartbeat,
                content: "",
                timestamp: Date.now(),
            })
        }, this.wsconfig?.heartbeatInterval)
    }

    private stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer)
            this.heartbeatTimer = null
        }
    }
    private reconnect() {
        if (this.reconnectTimer) return
        this.reconnectTimer = window.setTimeout(() => {
            this.connect()
            this.reconnectTimer = null
        }, this.wsconfig?.reconnectInterval)
    }

    public SendMessage(content: WsMessage) {
        this.send(content)
    }
}

export const WebSocketCli = new WebSocketClient(wsConfig)