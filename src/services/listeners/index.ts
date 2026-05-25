/**
 * 监听服务入口
 * 聚合所有 IPC 监听器，提供统一的 init / destroy 接口
 */

import { ipcService } from '../ipcService'
import { IpcChannels } from '@/types'
import { initResourceListener } from './resourceListener'
import { initWsMessageListener } from './wsMessageListener'
import { initWsNotificationListener } from './wsNotificationListener'
import { initWindowListener } from './windowListener'

class ListenerService {
    private initialized = false

    public init(): void {
        if (this.initialized) return
        this.initialized = true

        initResourceListener()
        initWsMessageListener()
        initWsNotificationListener()
        initWindowListener()
    }

    /**
     * 销毁所有监听器，释放 IPC 频道占用
     */
    public destroy(): void {
        if (!this.initialized) return
        ipcService.off(IpcChannels.RESOURCE_UPDATE)
        ipcService.off(IpcChannels.WS_MESSAGE)
        ipcService.off(IpcChannels.WS_MESSAGE_ACK)
        ipcService.off(IpcChannels.WS_NOTIFICATION)
        ipcService.off(IpcChannels.WINDOW_STATE)
        this.initialized = false
    }
}

export const listenerService = new ListenerService()
export default ListenerService
