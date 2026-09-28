/**
 * 监听服务入口
 * 聚合所有 IPC 监听器，提供统一的 init / destroy 接口
 */
import { initResourceListener } from './resourceListener'
import { initWsMessageListener } from './wsMessageListener'
import { initWsNotificationListener } from './wsNotificationListener'
import { initWsCallListener } from './wsCallListener'
import { initWindowListener } from './windowListener'
import { isMainWindow } from '@/src/utils/window'

class ListenerService {
    private initialized = false

    public init(): void {
        if (this.initialized) return
        this.initialized = true

        // 所有窗口都要：用户信息 / token 缓存同步，窗口状态与主题同步
        initResourceListener()
        initWindowListener()

        // 仅主窗口：WS 消息、通知、来电由主窗口统一处理一次（原因见 isMainWindow）。
        // 通话窗自己的信令由 useCallState 直接监听，不依赖这里
        if (isMainWindow()) {
            initWsMessageListener()
            initWsNotificationListener()
            initWsCallListener()
        }
    }

    /**
     * 销毁所有监听器，释放 IPC 频道占用
     */
    public destroy(): void {
        if (!this.initialized) return
        this.initialized = false
    }
}

export const listenerService = new ListenerService()
export default ListenerService
