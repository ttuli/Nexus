import { ipcService } from './ipcService'
import { IpcChannels, IpcResponse, ImTypes, ConnectionState } from '../types'



export interface WebSocketStateResponse extends IpcResponse {
    state: ConnectionState
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
     * 发送核心消息方法
     */
    async send(message: ImTypes.WSMessage, clientId = '', sessionId = ''): Promise<IpcResponse & { sent?: boolean, error?: string }> {
        return ipcService.invoke(IpcChannels.WS_SEND, message, clientId, sessionId)
    }
}

export const websocketService = new WebSocketService()
export default websocketService
