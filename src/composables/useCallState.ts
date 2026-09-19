/**
 * 通话控制器：RTCPeerConnection + 信令收发 + UI 状态。
 *
 * 只在通话窗（WindowKey.Call）内使用。主进程把信令广播到所有窗口，
 * 本 composable 直接消费属于自己 call_id 的帧，不经主窗口中转。
 *
 * 几条来自后端契约、写代码时必须守住的规则（详见 CALL_TODO.md §0 / §5.1）：
 *
 * 1. **late offer**：主叫收到 CALL_ACCEPT 之后才 createOffer，不在发起时产生 SDP。
 * 2. **当前仅支持语音**：视频通话已下线（服务器出向带宽仅 2 Mbps，一路 TURN 中转
 *    视频就要 ~3 Mbps，而语音只需 0.08 Mbps）。SDP 里只有 audio m-line 且建连后
 *    不变，因此无需 onnegotiationneeded 处理、无需 glare 防护。
 *    协议层的 CALL_MEDIA_TYPE_VIDEO 未删（后端无需改动），但客户端一律按语音处理。
 * 3. **对端媒体状态靠 CALL_MEDIA_UPDATE 驱动**，不要试图从 WebRTC 事件推断。
 */
import { ref, computed, onUnmounted } from 'vue';
import { ImTypes, IpcChannels } from '@shared/types';
import { CALL_CONFIG } from '@shared/config/constants';
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

export type CallPhase = 'idle' | 'calling' | 'ringing' | 'connected' | 'ended';

export function useCallState(opts: CallOptions) {
    const callId = ref(opts.callId ?? '');
    const phase = ref<CallPhase>(opts.isIncoming ? 'ringing' : 'calling');
    const endReason = ref<ImTypes.CallEndReason | null>(null);

    const isConnected = computed(() => phase.value === 'connected');
    const isMuted = ref(false);
    /** 对端麦克风开关（由 CALL_MEDIA_UPDATE 驱动，不从 WebRTC 事件推断） */
    const peerMicOn = ref(true);

    const localStream = ref<MediaStream | null>(null);
    const remoteStream = ref<MediaStream | null>(null);
    const errorText = ref('');

    let pc: RTCPeerConnection | null = null;
    /** setRemoteDescription 之前到达的 candidate 必须先缓存，否则 addIceCandidate 会抛错 */
    let pendingCandidates: RTCIceCandidateInit[] = [];
    let remoteDescSet = false;

    // ── 铃声 ────────────────────────────────────────────────────────────────
    //
    // 主叫放回铃音、被叫放来电铃声，共用同一段音频靠音量区分。
    // 挂在控制器而非视图里：铃声的起止完全由通话状态机决定（接通 / 任一终态都要停），
    // 放视图里就得再写一套 watch 去跟状态，容易漏掉某条终止路径导致铃声停不下来。
    let ringAudio: HTMLAudioElement | null = null;

    function startRinging() {
        if (ringAudio) return;
        const { url, incomingVolume, outgoingVolume } = CALL_CONFIG.ringtone;
        ringAudio = new Audio(url);
        ringAudio.loop = true;
        ringAudio.volume = opts.isIncoming ? incomingVolume : outgoingVolume;
        // 自动播放被拦截不影响通话本身，不要抛给上层
        ringAudio.play().catch((e) => console.warn('[useCallState] ring audio blocked:', e));
    }

    function stopRinging() {
        if (!ringAudio) return;
        ringAudio.pause();
        ringAudio.currentTime = 0;
        ringAudio = null;
    }

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
            // 仅采集音频：即便对端发来的是视频邀请（旧版本客户端），本端也只按语音接听
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            localStream.value = stream;
            return stream;
        } catch (e) {
            // 区分错误类型：三种原因用户的处理动作完全不同，笼统一句话会让人无从下手
            const name = (e as DOMException)?.name;
            if (name === 'NotAllowedError') {
                errorText.value = '麦克风被拒绝，请在系统隐私设置中允许本应用访问';
            } else if (name === 'NotReadableError' || name === 'TrackStartError') {
                errorText.value = '麦克风被其他程序占用，请关闭后重试';
            } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
                errorText.value = '未检测到麦克风';
            } else {
                errorText.value = '无法访问麦克风';
            }
            throw e;
        }
    }

    /**
     * ICE 配置要向后端拉短时凭证，故本函数是异步的。
     * 拉取失败时降级为仅 STUN——见 callService.getIceServers 的说明。
     */
    async function createPeerConnection(): Promise<RTCPeerConnection> {
        const iceServers = (await callService.getIceServers()) ?? CALL_CONFIG.fallbackIceServers;
        const conn = new RTCPeerConnection({ iceServers });

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

    /** 建立 PC 并挂上本地轨道。只有音频轨，SDP 中不会出现 video m-line。 */
    async function setupPeer(): Promise<RTCPeerConnection> {
        if (pc) return pc;
        const stream = await ensureLocalStream();
        pc = await createPeerConnection();
        stream.getTracks().forEach((track) => pc!.addTrack(track, stream));
        void startFollowingDefaultMic();
        return pc;
    }

    // ── 跟随系统默认音频设备 ────────────────────────────────────────────────
    //
    // **输出（扬声器/耳机）不需要任何代码**：我们从不调 `setSinkId()`，
    // 远端音频经 <video> 元素走系统默认输出，插拔耳机时由 Chromium 自动跟随。
    //
    // **输入（麦克风）必须显式处理**：getUserMedia 在采集那一刻就把 track 绑死在
    // 当时的默认设备上，之后系统默认变了它也不会跟着走 ——
    // 插上耳机后自己听筒换了，对方听到的却仍是笔记本内置麦克风。

    let defaultMicSignature = '';
    let deviceChangeTimer: ReturnType<typeof setTimeout> | null = null;

    /**
     * 读取当前系统默认输入设备的标识。
     * Chromium 会给出一个 `deviceId === 'default'` 的条目，其 `groupId` 指向当前实际默认设备，
     * 系统切换默认设备时该值会变；平台不提供该条目时退化为第一个输入设备的 id。
     */
    async function readDefaultMic(): Promise<string> {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const def = devices.find((d) => d.kind === 'audioinput' && d.deviceId === 'default');
            return def?.groupId
                || devices.find((d) => d.kind === 'audioinput')?.deviceId
                || '';
        } catch {
            return '';
        }
    }

    /** 系统默认输入设备变了就换轨。用 replaceTrack，不重建 PeerConnection——后者会重新走 ICE、通话出现可见中断 */
    async function syncDefaultMic() {
        if (!pc || !localStream.value) return;

        const next = await readDefaultMic();
        if (!next || next === defaultMicSignature) return;
        defaultMicSignature = next;

        const sender = pc.getSenders().find((s) => s.track?.kind === 'audio');
        if (!sender) return;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const track = stream.getAudioTracks()[0];
            if (!track) return;
            // 静音状态跟着走，否则换设备会把用户的静音悄悄解除
            track.enabled = !isMuted.value;

            const old = sender.track;
            await sender.replaceTrack(track);
            if (old) {
                localStream.value.removeTrack(old);
                old.stop();
            }
            localStream.value.addTrack(track);
        } catch (e) {
            console.warn('[useCallState] follow default mic failed:', e);
        }
    }

    async function startFollowingDefaultMic() {
        defaultMicSignature = await readDefaultMic();
        navigator.mediaDevices.addEventListener('devicechange', onDeviceChange);
    }

    /** 插拔一次设备 devicechange 可能连发数次，防抖后再查 */
    function onDeviceChange() {
        if (deviceChangeTimer) clearTimeout(deviceChangeTimer);
        deviceChangeTimer = setTimeout(() => {
            deviceChangeTimer = null;
            void syncDefaultMic();
        }, 300);
    }

    function stopFollowingDefaultMic() {
        navigator.mediaDevices.removeEventListener('devicechange', onDeviceChange);
        if (deviceChangeTimer) {
            clearTimeout(deviceChangeTimer);
            deviceChangeTimer = null;
        }
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
        if (opts.isIncoming) return;
        // 对方一接听就停回铃音，不等下面的媒体准备与 offer 交换 ——
        // setupPeer 可能触发设备采集，拖上一两秒铃声还在响会很怪
        stopRinging();

        // late offer：到这一步才产生 offer
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
        setTimeout(() => window.close(), CALL_CONFIG.endedCloseDelayMs);
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
                // camera_on 忽略：视频已下线，本端不展示对端画面
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
                return;
            }
            startRinging();
        } catch {
            phase.value = 'ended';
        }
    }

    async function acceptCall() {
        if (!callId.value) return;
        stopRinging();
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
        // camera_on 恒为 false：本端不再采集视频
        if (callId.value) {
            void callService.sendMediaUpdate(callId.value, false, !isMuted.value);
        }
    }

    // ── 清理 ────────────────────────────────────────────────────────────────

    function cleanup() {
        stopRinging();
        stopDurationTimer();
        stopFollowingDefaultMic();
        localStream.value?.getTracks().forEach((t) => t.stop());
        localStream.value = null;
        remoteStream.value = null;
        pc?.close();
        pc = null;
        pendingCandidates = [];
        remoteDescSet = false;
    }

    /**
     * 应用退出 / 登出时收尾：先把 hangup 发出去，再释放设备。
     *
     * 不发的后果：对端界面一直停在通话中，要等服务端 sweeper 超时才收敛
     * —— 振铃期 60s，已接通则是 4h 的通话时长上限，体感等于卡死。
     *
     * **必须挂在 LOGOUT_REMIND 而不能只挂 APP_QUIT**：两条退出路径的 WS 关闭时机不同 ——
     *   - 退出应用（resourceManager.destroy）：窗口先关、WS 后断，APP_QUIT 时还能发信令
     *   - 登出/被踢（resourceManager.kickout）：**WS 先断**、再关窗口，
     *     等到 APP_QUIT 时连接已经没了，信令必然发不出去
     * LOGOUT_REMIND 是登出链路里 WS 尚存的最后时机（主窗口那边还在弹确认框）。
     */
    let shuttingDown = false;
    async function endCallOnShutdown() {
        if (shuttingDown) return;
        shuttingDown = true;
        if (callId.value && phase.value !== 'ended') {
            phase.value = 'ended';
            await callService.hangup(callId.value, durationSeconds);
        }
        cleanup();
    }

    ipcService.on(IpcChannels.APP_QUIT, () => { void endCallOnShutdown(); });
    ipcService.on(IpcChannels.LOGOUT_REMIND, () => { void endCallOnShutdown(); });

    onUnmounted(() => {
        ipcService.off(IpcChannels.WS_CALL_SIGNAL);
        ipcService.off(IpcChannels.APP_QUIT);
        ipcService.off(IpcChannels.LOGOUT_REMIND);
        cleanup();
    });

    // 来电：窗口一打开就响铃（呼出侧的回铃音在 invite 发送成功后才起，见 startCall）
    if (opts.isIncoming) startRinging();

    return {
        callId,
        phase,
        endReason,
        isConnected,
        isMuted,
        peerMicOn,
        localStream,
        remoteStream,
        errorText,
        formattedDuration,
        startCall,
        acceptCall,
        hangup,
        toggleMute,
        stopDurationTimer,
    };
}
