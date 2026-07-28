/**
 * 通话控制器：RTCPeerConnection + 信令收发 + UI 状态。
 *
 * 只在通话窗（WindowKey.Call）内使用。主进程把信令广播到所有窗口，
 * 本 composable 直接消费属于自己 call_id 的帧，不经主窗口中转。
 *
 * 几条来自后端契约、写代码时必须守住的规则（详见 CALL_TODO.md §0 / §5.1）：
 *
 * 1. **late offer**：主叫收到 CALL_ACCEPT 之后才 createOffer，不在发起时产生 SDP。
 * 2. **不重协商**：video m-line 在建连时就协商好，中途开关摄像头用 replaceTrack，
 *    不触发 SDP 变更，因此无需 onnegotiationneeded 处理、无需 glare 防护。
 * 3. **关摄像头要 stop() 原 track**，只置 enabled=false 会让摄像头指示灯常亮，
 *    用户会以为在被偷拍。
 * 4. **对端媒体状态靠 CALL_MEDIA_UPDATE 驱动**，不要试图从 WebRTC 事件推断。
 */
import { ref, computed, onUnmounted } from 'vue';
import { ImTypes, IpcChannels } from '@shared/types';
import { callService, ipcService } from '@/src/services';

export interface CallOptions {
    /** 来电时由服务端下发；呼出时为空，等 CALL_INVITE 回执带回 */
    callId?: string;
    /** 对端用户 ID */
    peerId: number;
    sessionKey: string;
    mediaType: ImTypes.CallMediaType;
    isIncoming: boolean;
}

// 第一版先用公共 STUN；TURN 配置待后端 §7 落地后改为下发
const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

export type CallPhase = 'idle' | 'calling' | 'ringing' | 'connected' | 'ended';

export function useCallState(opts: CallOptions) {
    const callId = ref(opts.callId ?? '');
    const phase = ref<CallPhase>(opts.isIncoming ? 'ringing' : 'calling');
    const endReason = ref<ImTypes.CallEndReason | null>(null);
    const isVideoCall = opts.mediaType === ImTypes.CallMediaType.CALL_MEDIA_TYPE_VIDEO;

    const isConnected = computed(() => phase.value === 'connected');
    const isMuted = ref(false);
    const isVideoEnabled = ref(isVideoCall);
    /** 对端媒体开关（由 CALL_MEDIA_UPDATE 驱动，不从 WebRTC 事件推断） */
    const peerCameraOn = ref(isVideoCall);
    const peerMicOn = ref(true);

    const localStream = ref<MediaStream | null>(null);
    const remoteStream = ref<MediaStream | null>(null);
    const errorText = ref('');

    let pc: RTCPeerConnection | null = null;
    /** setRemoteDescription 之前到达的 candidate 必须先缓存，否则 addIceCandidate 会抛错 */
    let pendingCandidates: RTCIceCandidateInit[] = [];
    let remoteDescSet = false;

    // ── 通话时长 ────────────────────────────────────────────────────────────
    const formattedDuration = ref('00:00');
    let durationTimer: ReturnType<typeof setInterval> | null = null;
    let durationSeconds = 0;

    const startDurationTimer = () => {
        if (durationTimer) return;
        durationSeconds = 0;
        durationTimer = setInterval(() => {
            durationSeconds++;
            const m = Math.floor(durationSeconds / 60).toString().padStart(2, '0');
            const s = (durationSeconds % 60).toString().padStart(2, '0');
            formattedDuration.value = `${m}:${s}`;
        }, 1000);
    };

    const stopDurationTimer = () => {
        if (durationTimer) {
            clearInterval(durationTimer);
            durationTimer = null;
        }
    };

    // ── 媒体 ────────────────────────────────────────────────────────────────

    async function ensureLocalStream(): Promise<MediaStream> {
        if (localStream.value) return localStream.value;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: isVideoCall,
            });
            localStream.value = stream;
            return stream;
        } catch (e) {
            // 系统级隐私开关关闭 / 设备被占用都会走到这里，必须给出明确提示而非静默失败
            errorText.value = '无法访问麦克风或摄像头，请检查系统权限设置';
            throw e;
        }
    }

    function createPeerConnection(): RTCPeerConnection {
        const conn = new RTCPeerConnection({ iceServers: ICE_SERVERS });

        conn.onicecandidate = (e) => {
            if (e.candidate && callId.value) {
                void callService.sendIce(callId.value, e.candidate);
            }
        };

        conn.ontrack = (e) => {
            if (!remoteStream.value) remoteStream.value = new MediaStream();
            remoteStream.value.addTrack(e.track);
        };

        conn.onconnectionstatechange = () => {
            if (conn.connectionState === 'failed') {
                errorText.value = '连接失败';
                void hangup();
            }
        };

        return conn;
    }

    /** 建立 PC 并挂上本地轨道。视频通话在此自然协商出 video m-line。 */
    async function setupPeer(): Promise<RTCPeerConnection> {
        if (pc) return pc;
        const stream = await ensureLocalStream();
        pc = createPeerConnection();
        stream.getTracks().forEach((track) => pc!.addTrack(track, stream));
        return pc;
    }

    async function flushPendingCandidates() {
        if (!pc || !remoteDescSet) return;
        for (const c of pendingCandidates) {
            try {
                await pc.addIceCandidate(c);
            } catch (e) {
                console.warn('[useCallState] addIceCandidate failed:', e);
            }
        }
        pendingCandidates = [];
    }

    // ── 信令处理 ────────────────────────────────────────────────────────────

    async function onAccepted() {
        // late offer：到这一步才产生 offer
        if (opts.isIncoming) return;
        const conn = await setupPeer();
        const offer = await conn.createOffer();
        await conn.setLocalDescription(offer);
        await callService.sendSdp(callId.value, ImTypes.SdpType.SDP_TYPE_OFFER, offer.sdp ?? '');
        phase.value = 'connected';
        startDurationTimer();
    }

    async function onSdp(sdp: ImTypes.CallSdp) {
        const conn = await setupPeer();

        if (sdp.sdp_type === ImTypes.SdpType.SDP_TYPE_OFFER) {
            await conn.setRemoteDescription({ type: 'offer', sdp: sdp.sdp });
            remoteDescSet = true;
            await flushPendingCandidates();

            const answer = await conn.createAnswer();
            await conn.setLocalDescription(answer);
            await callService.sendSdp(callId.value, ImTypes.SdpType.SDP_TYPE_ANSWER, answer.sdp ?? '');
        } else {
            await conn.setRemoteDescription({ type: 'answer', sdp: sdp.sdp });
            remoteDescSet = true;
            await flushPendingCandidates();
        }
    }

    async function onIce(ice: ImTypes.CallIce) {
        const init: RTCIceCandidateInit = {
            candidate: ice.candidate,
            sdpMid: ice.sdp_mid || undefined,
            sdpMLineIndex: ice.sdp_mline_index,
            usernameFragment: ice.username_fragment || undefined,
        };
        if (!pc || !remoteDescSet) {
            pendingCandidates.push(init);
            return;
        }
        try {
            await pc.addIceCandidate(init);
        } catch (e) {
            console.warn('[useCallState] addIceCandidate failed:', e);
        }
    }

    function onEnded(reason: ImTypes.CallEndReason) {
        endReason.value = reason;
        phase.value = 'ended';
        cleanup();
        // 留一小段让用户看清结束原因再关窗
        setTimeout(() => window.close(), 1200);
    }

    function handleSignal(type: ImTypes.MessageType, payload: Uint8Array) {
        switch (type) {
            case ImTypes.MessageType.CALL_INVITE: {
                // 呼出方的回执：带回服务端分配的 call_id
                const invite = ImTypes.CallInvite.decode(payload);
                if (!opts.isIncoming && !callId.value) callId.value = invite.call_id;
                break;
            }
            case ImTypes.MessageType.CALL_ACCEPT: {
                const accept = ImTypes.CallAccept.decode(payload);
                if (accept.call_id !== callId.value) return;
                void onAccepted();
                break;
            }
            case ImTypes.MessageType.CALL_SDP: {
                const sdp = ImTypes.CallSdp.decode(payload);
                if (sdp.call_id !== callId.value) return;
                void onSdp(sdp);
                break;
            }
            case ImTypes.MessageType.CALL_ICE: {
                const ice = ImTypes.CallIce.decode(payload);
                if (ice.call_id !== callId.value) return;
                void onIce(ice);
                break;
            }
            case ImTypes.MessageType.CALL_MEDIA_UPDATE: {
                const upd = ImTypes.CallMediaUpdate.decode(payload);
                if (upd.call_id !== callId.value) return;
                peerCameraOn.value = upd.camera_on;
                peerMicOn.value = upd.mic_on;
                break;
            }
            case ImTypes.MessageType.CALL_END: {
                const end = ImTypes.CallEnd.decode(payload);
                // call_id 为空是发起失败（如忙线）时服务端的直接回执，一并处理
                if (end.call_id && end.call_id !== callId.value) return;
                onEnded(end.reason);
                break;
            }
        }
    }

    ipcService.on(IpcChannels.WS_CALL_SIGNAL, (_e, data: any) => {
        try {
            const payload = data.payload instanceof Uint8Array
                ? data.payload
                : new Uint8Array(data.payload);
            handleSignal(data.type, payload);
        } catch (e) {
            console.error('[useCallState] handle signal failed:', e);
        }
    });

    // ── 用户操作 ────────────────────────────────────────────────────────────

    /** 呼出：发 invite，等 CALL_ACCEPT 再产生 offer */
    async function startCall() {
        try {
            await ensureLocalStream(); // 提前采集，呼出界面可本地预览
            const ok = await callService.invite(opts.peerId, opts.sessionKey, opts.mediaType);
            if (!ok) {
                errorText.value = '网络未连接，无法发起通话';
                phase.value = 'ended';
            }
        } catch {
            phase.value = 'ended';
        }
    }

    async function acceptCall() {
        if (!callId.value) return;
        try {
            await setupPeer();
            await callService.accept(callId.value);
            phase.value = 'connected';
            startDurationTimer();
        } catch (e) {
            console.error('[useCallState] accept failed:', e);
        }
    }

    /** 挂断 / 取消 / 拒接统一入口，服务端按状态归一 */
    async function hangup() {
        if (callId.value) {
            await callService.hangup(callId.value, durationSeconds);
        }
        phase.value = 'ended';
        cleanup();
        window.close();
    }

    function toggleMute() {
        isMuted.value = !isMuted.value;
        localStream.value?.getAudioTracks().forEach((t) => (t.enabled = !isMuted.value));
        if (callId.value) {
            void callService.sendMediaUpdate(callId.value, isVideoEnabled.value, !isMuted.value);
        }
    }

    /**
     * 开关摄像头。**不触发重协商**：video m-line 建连时已协商，
     * replaceTrack 按规范就是为「不改 SDP 地换轨」设计的。
     */
    async function toggleVideo() {
        if (!isVideoCall || !pc) return;
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video')
            ?? pc.getSenders().find((s) => s.track === null);
        if (!sender) return;

        if (isVideoEnabled.value) {
            // 关：replaceTrack(null) + stop 原 track。
            // 只置 enabled=false 会让摄像头指示灯常亮 —— 用户会认为仍在被拍摄。
            const track = sender.track;
            await sender.replaceTrack(null);
            track?.stop();
            localStream.value?.getVideoTracks().forEach((t) => localStream.value!.removeTrack(t));
            isVideoEnabled.value = false;
        } else {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            const track = stream.getVideoTracks()[0];
            await sender.replaceTrack(track);
            localStream.value?.addTrack(track);
            isVideoEnabled.value = true;
        }

        if (callId.value) {
            void callService.sendMediaUpdate(callId.value, isVideoEnabled.value, !isMuted.value);
        }
    }

    // ── 清理 ────────────────────────────────────────────────────────────────

    function cleanup() {
        stopDurationTimer();
        // 摄像头必须显式 stop，否则指示灯不灭
        localStream.value?.getTracks().forEach((t) => t.stop());
        localStream.value = null;
        remoteStream.value = null;
        pc?.close();
        pc = null;
        pendingCandidates = [];
        remoteDescSet = false;
    }

    onUnmounted(() => {
        ipcService.off(IpcChannels.WS_CALL_SIGNAL);
        cleanup();
    });

    // 窗口被主进程要求退出时同样要释放设备
    ipcService.on(IpcChannels.APP_QUIT, () => cleanup());

    return {
        callId,
        phase,
        endReason,
        isConnected,
        isMuted,
        isVideoEnabled,
        isVideoCall,
        peerCameraOn,
        peerMicOn,
        localStream,
        remoteStream,
        errorText,
        formattedDuration,
        startCall,
        acceptCall,
        hangup,
        toggleMute,
        toggleVideo,
        stopDurationTimer,
    };
}
