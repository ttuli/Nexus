import { ipcService } from './ipcService'
import { IpcChannels, IpcResponse, ImTypes, ConnectionState } from '@shared/types'



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
    /**
     * 监听连接状态变化
     */
    onStateChange(callback: (state: ConnectionState) => void) {
        ipcService.on(IpcChannels.WS_STATE_CHANGE, (_e, state) => {
            callback(state as ConnectionState)
        })
    }

    /**
     * 移除连接状态变化监听
     */
    offStateChange() {
        ipcService.off(IpcChannels.WS_STATE_CHANGE)
    }
}

export const websocketService = new WebSocketService()
export default websocketService
