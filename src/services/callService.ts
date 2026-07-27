/**
 * 通话信令服务（纯 I/O）
 *
 * 只负责把信令结构编码成 WSMessage 发出去，不碰 store、不做编排。
 * 收信令在 `listeners/wsCallListener.ts`（拉起窗口）与通话窗内的 `useCallState`（驱动 PC）。
 *
 * 后端契约（详见 CALL_TODO.md §0）：
 * - `call_id` / `caller_id` 由服务端分配，客户端上报的一律忽略，故此处不生成
 * - 取消 / 拒接统一发 `hangup`，服务端按通话状态归一为 CANCELED / REJECTED
 * - 握手是 late offer：主叫收到 CALL_ACCEPT 之后才产生 offer
 */
import { websocketService } from './websocketService'
import { ImTypes } from '@shared/types'

/** 编码信令载荷并发送，返回是否成功送出（断连即 false，不排队不补投） */
async function sendSignal(type: ImTypes.MessageType, payload: Uint8Array): Promise<boolean> {
    const res = await websocketService.sendSignal({
        route_target: [],
        route_target_type: ImTypes.TargetType.USER,
        timestamp: Date.now(),
        type,
        payload,
        sender_id: 0,
        version: 0,
        msg_id: '',
        session_id: '',
        msg_seq: '0',
        deliver_to: [],
    })
    return res.success && (res.data as any)?.sent === true
}

class CallService {
    /**
     * 发起通话。`call_id` 留空由服务端分配，随后经 CALL_INVITE 回执带回。
     */
    invite(calleeId: number, sessionKey: string, mediaType: ImTypes.CallMediaType): Promise<boolean> {
        return sendSignal(
            ImTypes.MessageType.CALL_INVITE,
            ImTypes.CallInvite.encode({
                call_id: '',
                caller_id: 0,
                callee_id: calleeId,
                session_key: sessionKey,
                media_type: mediaType,
                invite_at: Date.now(),
                ring_deadline: 0,
            }).finish()
        )
    }

    /** 接听 */
    accept(callId: string): Promise<boolean> {
        return sendSignal(
            ImTypes.MessageType.CALL_ACCEPT,
            ImTypes.CallAccept.encode({ call_id: callId, callee_id: 0, accept_at: Date.now() }).finish()
        )
    }

    /**
     * 挂断 / 取消 / 拒接统一入口。
     * 服务端按当前状态归一：振铃中主叫发 → CANCELED、被叫发 → REJECTED；已接通 → COMPLETED。
     */
    hangup(callId: string, duration = 0): Promise<boolean> {
        return sendSignal(
            ImTypes.MessageType.CALL_HANGUP,
            ImTypes.CallHangup.encode({
                call_id: callId,
                operator_id: 0,
                hangup_at: Date.now(),
                duration,
            }).finish()
        )
    }

    /** 发送 SDP（offer / answer） */
    sendSdp(callId: string, sdpType: ImTypes.SdpType, sdp: string): Promise<boolean> {
        return sendSignal(
            ImTypes.MessageType.CALL_SDP,
            ImTypes.CallSdp.encode({ call_id: callId, sdp_type: sdpType, sdp }).finish()
        )
    }

    /** 发送 ICE candidate（trickle） */
    sendIce(callId: string, c: RTCIceCandidate): Promise<boolean> {
        return sendSignal(
            ImTypes.MessageType.CALL_ICE,
            ImTypes.CallIce.encode({
                call_id: callId,
                candidate: c.candidate,
                sdp_mid: c.sdpMid ?? '',
                sdp_mline_index: c.sdpMLineIndex ?? 0,
                username_fragment: c.usernameFragment ?? '',
            }).finish()
        )
    }

    /**
     * 上报本端摄像头 / 麦克风开关。
     * 这是对端 UI 的唯一驱动源：replaceTrack(null) 不改 SDP、不触发对端 ontrack，
     * 不发这条对方只会看到画面凝固而无从判断是关了摄像头还是卡住了。
     */
    sendMediaUpdate(callId: string, cameraOn: boolean, micOn: boolean): Promise<boolean> {
        return sendSignal(
            ImTypes.MessageType.CALL_MEDIA_UPDATE,
            ImTypes.CallMediaUpdate.encode({
                call_id: callId,
                from_user_id: 0,
                camera_on: cameraOn,
                mic_on: micOn,
            }).finish()
        )
    }

    /**
     * 查询是否有仍在振铃的来电（上线补投）。
     * 服务端已完成「主叫仍在线」+「剩余振铃 ≥ 5s」复核，回复经 wsCallListener 处理。
     */
    queryPending(): Promise<boolean> {
        return sendSignal(
            ImTypes.MessageType.CALL_PENDING,
            ImTypes.CallPending.encode({ has_pending: false, invite: undefined, remaining_ms: 0 }).finish()
        )
    }
}

export const callService = new CallService()
export default callService
