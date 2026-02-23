import { ipcService } from './ipcService'
import { IpcChannels, IpcResponse, ImTypes } from '../types'

/**
 * WebSocket 连接状态
 */
export enum WebSocketState {
    CONNECTING = 0,
    OPEN = 1,
    CLOSING = 2,
    CLOSED = 3,
}

export type WsMessage = ImTypes.WSMessage

export interface WebSocketStateResponse extends IpcResponse {
    state: WebSocketState
    pendingCount: number
}

class WebSocketService {
    /**
     * 连接 WebSocket
     */
    async connect(): Promise<IpcResponse> {
        return ipcService.invoke(IpcChannels.WS_CONNECT)
    }

    /**
     * 发送消息
     */
    async send(message: ImTypes.WSMessage, clientId = ''): Promise<IpcResponse & { sent?: boolean, error?: string }> {
        return ipcService.invoke(IpcChannels.WS_SEND, message, clientId)
    }
}

export const websocketService = new WebSocketService()
export default websocketService
