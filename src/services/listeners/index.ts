/**
 * 监听服务入口
 * 聚合所有 IPC 监听器，提供统一的 init / destroy 接口
 */
import { initResourceListener } from './resourceListener'
import { initWsMessageListener } from './wsMessageListener'
import { initWsNotificationListener } from './wsNotificationListener'
import { initWsCallListener } from './wsCallListener'
import { initWindowListener } from './windowListener'
import { initHistoryListener } from './historyListener'
import { initChatJumpListener } from './chatJumpListener'
import { currentWindowKey } from '@/src/utils/window'
import { WindowKey } from '@shared/config/windowKeys'

type ListenerInit = () => void

/** 所有窗口都要：用户信息 / token 缓存同步，窗口状态与主题同步 */
const COMMON_LISTENERS: ListenerInit[] = [initResourceListener, initWindowListener]

/**
 * 按窗口追加的监听。新窗口要监听什么，在这里登记一行。
 *
 * 主进程把 WS 消息广播给所有窗口，而会话状态、未读、提示音、本地落库只该处理一次：
 * 其他窗口的会话 store 是空的，照跑同一套逻辑会重复响提示音，还会把默认值
 * （未置顶、未免打扰）写回 SQLite 覆盖真实会话。所以会落库、改会话、响提示音的监听只能登记在主窗口下。
 * 通话窗自己的信令由 useCallState 直接监听，不依赖这里
 */
const WINDOW_LISTENERS: Partial<Record<WindowKey, ListenerInit[]>> = {
    [WindowKey.Home]: [initWsMessageListener, initWsNotificationListener, initWsCallListener, initChatJumpListener],
    [WindowKey.History]: [initHistoryListener],
}

class ListenerService {
    private initialized = false

    public init(): void {
        if (this.initialized) return
        this.initialized = true

        const key = currentWindowKey()
        const windowListeners = (key && WINDOW_LISTENERS[key]) || []
        for (const init of [...COMMON_LISTENERS, ...windowListeners]) init()
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
