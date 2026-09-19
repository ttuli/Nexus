/**
 * 通话信令监听（主窗口侧，编排层）
 *
 * **职责边界**：本监听器只负责「把通话窗拉起来」。
 * SDP / ICE / MEDIA_UPDATE / END 这些驱动 RTCPeerConnection 的帧由通话窗内的
 * `useCallState` 直接消费 —— 主进程把信令广播到所有窗口，两个渲染进程各取所需，
 * 不需要主窗口做中转。
 *
 * 主窗口需要处理的只有两类：
 *   - CALL_INVITE：**来电**（注意排除服务端回发给主叫的回执）
 *   - CALL_PENDING：上线补投命中的来电
 */
import { ipcService } from '../ipcService'
import { windowService } from '../windowService'
import { IpcChannels, ImTypes } from '@shared/types'
import { WindowKey } from '@shared/config/windowKeys'
import { useUserStore } from '@/src/store/user'

interface CallSignalEvent {
    type: ImTypes.MessageType
    payload: Uint8Array
    timestamp: number
    senderId: number
}

/**
 * 已处理过的 call_id。
 *
 * 后端「先写状态再推送」的顺序下，一通电话可能同时经实时推送与上线补投两条路径抵达，
 * 必须按 call_id 幂等去重，否则会弹出两个通话窗。
 * 通话窗自身也按 key 去重（同 key 窗口只会有一个），这里是第一道。
 */
const handledCalls = new Set<string>()

/** 拉起来电窗口 */
function openIncomingCall(invite: ImTypes.CallInvite): void {
    if (!invite.call_id || handledCalls.has(invite.call_id)) return
    handledCalls.add(invite.call_id)

    // 视频通话已下线，一律按语音窗口尺寸拉起
    windowService.createWindow(
        WindowKey.Call,
        {
            callId: invite.call_id,
            peerId: invite.caller_id,
            sessionKey: invite.session_key,
            mediaType: invite.media_type,
            isIncoming: 1,
            targetType: 'private',
        },
    )
}

function handleInvite(payload: Uint8Array): void {
    const invite = ImTypes.CallInvite.decode(payload)

    // 服务端会把 CALL_INVITE 原类型回发给主叫（带回分配好的 call_id），
    // 主叫侧必须识别出这是自己的回执，否则会给自己弹一个接听界面。
    // 回执由通话窗消费，这里直接忽略。
    if (invite.caller_id === useUserStore().getUserID()) return

    openIncomingCall(invite)
}

function handlePending(payload: Uint8Array): void {
    const pending = ImTypes.CallPending.decode(payload)
    if (!pending.has_pending || !pending.invite) return

    // 服务端已复核「主叫仍在线」+「剩余振铃 ≥ 5s」，客户端不再自行判断，
    // 自行判断会与服务端口径不一致
    openIncomingCall(pending.invite)
}

export function initWsCallListener(): void {
    ipcService.on(IpcChannels.WS_CALL_SIGNAL, (_e, data: CallSignalEvent) => {
        try {
            const payload = data.payload instanceof Uint8Array
                ? data.payload
                : new Uint8Array(data.payload as any)

            switch (data.type) {
                case ImTypes.MessageType.CALL_INVITE:
                    handleInvite(payload)
                    break
                case ImTypes.MessageType.CALL_PENDING:
                    handlePending(payload)
                    break
                // 其余信令由通话窗内的 useCallState 消费
            }
        } catch (e) {
            console.error('[wsCallListener] handle call signal failed:', e)
        }
    })
}

/** 通话结束后清理去重记录，避免长期运行累积 */
export function forgetCall(callId: string): void {
    handledCalls.delete(callId)
}
