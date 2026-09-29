/**
 * 通话控制器：RTCPeerConnection + 信令收发 + UI 状态。
 *
 * 只在通话窗（WindowKey.Call）内使用。主进程把信令广播到所有窗口，
 * 本 composable 直接消费属于自己 call_id 的帧，不经主窗口中转。
 *
 * 几条来自后端契约、写代码时必须守住的规则（详见 CALL_TODO.md §0 / §5.1）：
 *
 * 1. **late offer**：主叫收到 CALL_ACCEPT 之后才 createOffer，不在发起时产生 SDP。
 * 2. **当前仅支持语音**：视频通话已下线。服务器出向带宽 2 Mbps、业务基线占约 0.37 Mbps，
 *    一路 TURN 中转的 720p 视频要 ~3 Mbps 出向，连一路都跑不起来；语音每路仅 0.08 Mbps。
 *    只做语音才付得起 TURN，而没有 TURN，双方都在对称 NAT 后时通话建不起来（约 10~20%）。
 *    SDP 里只有 audio m-line 且建连后不变，因此无需 onnegotiationneeded 处理、无需 glare 防护。
 *    恢复视频的条件：出向带宽升到 30 Mbps 以上，或视频中转改用托管 TURN 服务。协议层的
 *    CALL_MEDIA_TYPE_VIDEO 未删、后端无需改动，恢复时还原客户端改动即可（见提交 f2fd618）。
 * 3. **对端媒体状态靠 CALL_MEDIA_UPDATE 驱动**，不要试图从 WebRTC 事件推断。
 * 4. **「接听」≠「接通」**：接听后要等 ICE 连通才有声音，期间是 connecting，
 *    不能提前显示「通话中」——否则连不上时界面照样计时，用户只会觉得「对方没声音」。
 */
import { ref, onUnmounted } from 'vue';
import { ImTypes, IpcChannels } from '@shared/types';
import { CALL_CONFIG } from '@shared/config/constants';
import { callService, ipcService, userService } from '@/src/services';
import { useUserStore } from '@/src/store/user';
import { publicUrl } from '@/src/utils/resourceUrl';

export interface CallOptions {
    /** 来电时由服务端下发；呼出时为空，等 CALL_INVITE 回执带回 */
    callId?: string;
    /** 对端用户 ID */
    peerId: number;
    sessionKey: string;
    mediaType: ImTypes.CallMediaType;
    isIncoming: boolean;
}

/**
 * 通话阶段
 * - calling：主叫已发出邀请，等对方接听
 * - ringing：被叫来电振铃中
 * - connecting：已接听，媒体连接建立中（此时还听不到声音）
 * - connected：媒体连接已建立
 * - ended：已结束
 */
export type CallPhase = 'calling' | 'ringing' | 'connecting' | 'connected' | 'ended';

export function useCallState(opts: CallOptions) {
    const callId = ref(opts.callId ?? '');
    const phase = ref<CallPhase>(opts.isIncoming ? 'ringing' : 'calling');
    const endReason = ref<ImTypes.CallEndReason | null>(null);

    const isMuted = ref(false);
    /** 对端麦克风开关（由 CALL_MEDIA_UPDATE 驱动，不从 WebRTC 事件推断） */
    const peerMicOn = ref(true);
    /** 通话中网络短暂中断（ICE disconnected），会自行恢复，真断了会转为失败 */
    const networkWeak = ref(false);

    const remoteStream = ref<MediaStream | null>(null);
    const errorText = ref('');

    let localStream: MediaStream | null = null;
    let pc: RTCPeerConnection | null = null;
    /** 进行中的建连，见 setupPeer */
    let peerSetup: Promise<RTCPeerConnection> | null = null;
    /** 已收尾：迟到的异步结果（麦克风、PC）直接释放，不再挂回来 */
    let disposed = false;
    /** setRemoteDescription 之前到达的 candidate 必须先缓存，否则 addIceCandidate 会抛错 */
    let pendingCandidates: RTCIceCandidateInit[] = [];
    /** 候选收发计数，只用于诊断日志 */
    let candidatesSent = 0;
    let candidatesReceived = 0;

    // ── 对端信息 ────────────────────────────────────────────────────────────

    async function loadPeerInfo() {
        const userStore = useUserStore();
        if (userStore.getUser(opts.peerId)) return;
        const users = await userService.fetchByIds([opts.peerId]);
        users.forEach((u) => userStore.setUser(u));
    }

    // ── 铃声 ────────────────────────────────────────────────────────────────
    //
    // 主叫放回铃音、被叫放来电铃声，共用同一段音频靠音量区分。
    // 挂在控制器而非视图里：铃声的起止完全由通话状态机决定（接通 / 任一终态都要停），
    // 放视图里就得再写一套 watch 去跟状态，容易漏掉某条终止路径导致铃声停不下来。
    let ringAudio: HTMLAudioElement | null = null;

    function startRinging() {
        if (ringAudio) return;
        const { path, incomingVolume, outgoingVolume } = CALL_CONFIG.ringtone;
        ringAudio = new Audio(publicUrl(path));
        ringAudio.loop = true;
        ringAudio.volume = opts.isIncoming ? incomingVolume : outgoingVolume;
        // 自动播放被拦截不影响通话本身，不要抛给上层
        ringAudio.play().catch((e) => console.warn('[Call] ring audio blocked:', e));
    }

    function stopRinging() {
        if (!ringAudio) return;
        ringAudio.pause();
        ringAudio = null;
    }

    // ── 通话时长 ────────────────────────────────────────────────────────────
    const formattedDuration = ref('00:00');
    let durationTimer: ReturnType<typeof setInterval> | null = null;
    let durationSeconds = 0;

    function startDurationTimer() {
        if (durationTimer) return;
        durationSeconds = 0;
        durationTimer = setInterval(() => {
            durationSeconds++;
            const m = Math.floor(durationSeconds / 60).toString().padStart(2, '0');
            const s = (durationSeconds % 60).toString().padStart(2, '0');
            formattedDuration.value = `${m}:${s}`;
        }, 1000);
    }

    function stopDurationTimer() {
        if (durationTimer) {
            clearInterval(durationTimer);
            durationTimer = null;
        }
    }

    // ── 接通超时 ────────────────────────────────────────────────────────────
    //
    // 两端一个候选都没交换成功时 ICE 会一直停在 checking，connectionState 永远到不了 failed，
    // 不设超时界面就会无限「正在连接」。
    let connectTimer: ReturnType<typeof setTimeout> | null = null;

    function enterConnecting() {
        phase.value = 'connecting';
        connectTimer = setTimeout(() => {
            connectTimer = null;
            if (phase.value === 'connecting') {
                void failCall('连接超时，请检查网络后重试');
            }
        }, CALL_CONFIG.connectTimeoutMs);
    }

    function clearConnectTimer() {
        if (connectTimer) {
            clearTimeout(connectTimer);
            connectTimer = null;
        }
    }

    // ── 媒体 ────────────────────────────────────────────────────────────────

    async function ensureLocalStream(): Promise<MediaStream> {
        if (localStream) return localStream;
        let stream: MediaStream;
        try {
            // 仅采集音频：即便对端发来的是视频邀请（旧版本客户端），本端也只按语音接听
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
        if (disposed) {
            stream.getTracks().forEach((t) => t.stop());
            throw new Error('call already ended');
        }
        localStream = stream;
        return stream;
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
                candidatesSent++;
                void callService.sendIce(callId.value, e.candidate);
            }
        };

        conn.ontrack = (e) => {
            // 对端 addTrack 时带了 stream（msid），直接用；拿不到时兜底自建
            remoteStream.value = e.streams[0] ?? new MediaStream([e.track]);
        };

        conn.onconnectionstatechange = () => onConnectionStateChange(conn);

        return conn;
    }

    /**
     * 建立 PC 并挂上本地音频轨。只有音频轨，SDP 中不会出现 video m-line。
     *
     * 用进行中的 Promise 去重：建连要先后等麦克风与 TURN 凭证两次异步，期间若被重复触发
     * （连点接听、重复收到 ACCEPT），各自建一个 PC 就会发出两套 offer / 候选，
     * 对端按哪一套都对不上。
     */
    function setupPeer(): Promise<RTCPeerConnection> {
        peerSetup ??= (async () => {
            const stream = await ensureLocalStream();
            const conn = await createPeerConnection();
            if (disposed) {
                conn.close();
                throw new Error('call already ended');
            }
            stream.getTracks().forEach((track) => conn.addTrack(track, stream));
            pc = conn;
            void startFollowingDefaultMic();
            return conn;
        })();
        return peerSetup;
    }

    function onConnectionStateChange(conn: RTCPeerConnection) {
        if (conn !== pc) return;
        const state = conn.connectionState;
        console.info('[Call] connection state:', state);

        switch (state) {
            case 'connected':
                networkWeak.value = false;
                if (phase.value === 'connecting') {
                    clearConnectTimer();
                    phase.value = 'connected';
                    startDurationTimer();
                    void logMediaPath(conn);
                }
                break;
            case 'disconnected':
                // ICE 同意检测短暂失败，通常几秒内自行恢复；恢复不了会转为 failed
                if (phase.value === 'connected') networkWeak.value = true;
                break;
            case 'failed':
                void failCall('网络连接失败，通话已结束');
                break;
        }
    }

    /**
     * 接通后记录实际走的链路：host（局域网直连）/ srflx（公网打洞）/ relay（TURN 中继），
     * 以及候选收发数。排查「接通了但没声音」时先看这一行。
     */
    async function logMediaPath(conn: RTCPeerConnection) {
        try {
            const stats = await conn.getStats();
            let pairId = '';
            stats.forEach((s) => {
                if (s.type === 'transport' && s.selectedCandidatePairId) pairId = s.selectedCandidatePairId;
            });
            const pair = pairId ? stats.get(pairId) : undefined;
            const local = pair ? stats.get(pair.localCandidateId) : undefined;
            const remote = pair ? stats.get(pair.remoteCandidateId) : undefined;
            console.info(
                `[Call] media path: ${local?.candidateType ?? '?'} -> ${remote?.candidateType ?? '?'} (${local?.protocol ?? '?'}),`
                + ` candidates sent/received: ${candidatesSent}/${candidatesReceived}`,
            );
        } catch {
            // 仅诊断用途，失败无影响
        }
    }

    // ── 跟随系统默认音频设备 ────────────────────────────────────────────────
    //
    // **输出（扬声器/耳机）不需要任何代码**：我们从不调 `setSinkId()`，
    // 远端音频经 <audio> 元素走系统默认输出，插拔耳机时由 Chromium 自动跟随。
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
        if (!pc || !localStream) return;

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
                localStream.removeTrack(old);
                old.stop();
            }
            localStream.addTrack(track);
        } catch (e) {
            console.warn('[Call] follow default mic failed:', e);
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

    async function addCandidate(conn: RTCPeerConnection, candidate: RTCIceCandidateInit) {
        try {
            await conn.addIceCandidate(candidate);
        } catch (e) {
            console.warn('[Call] addIceCandidate failed:', e);
        }
    }

    async function applyPendingCandidates(conn: RTCPeerConnection) {
        const queued = pendingCandidates;
        pendingCandidates = [];
        for (const c of queued) await addCandidate(conn, c);
    }

    // ── 信令处理 ────────────────────────────────────────────────────────────

    async function onAccepted() {
        if (opts.isIncoming || phase.value !== 'calling') return;
        // 对方一接听就停回铃音，不等下面的媒体准备与 offer 交换
        stopRinging();
        enterConnecting();

        try {
            // late offer：到这一步才产生 offer
            const conn = await setupPeer();
            const offer = await conn.createOffer();
            await conn.setLocalDescription(offer);
            await callService.sendSdp(callId.value, ImTypes.SdpType.SDP_TYPE_OFFER, offer.sdp ?? '');
        } catch (e) {
            console.error('[Call] create offer failed:', e);
            void failCall(errorText.value || '通话建立失败');
        }
    }

    async function onSdp(sdp: ImTypes.CallSdp) {
        try {
            const conn = await setupPeer();

            if (sdp.sdp_type === ImTypes.SdpType.SDP_TYPE_OFFER) {
                await conn.setRemoteDescription({ type: 'offer', sdp: sdp.sdp });
                await applyPendingCandidates(conn);

                const answer = await conn.createAnswer();
                await conn.setLocalDescription(answer);
                await callService.sendSdp(callId.value, ImTypes.SdpType.SDP_TYPE_ANSWER, answer.sdp ?? '');
            } else {
                await conn.setRemoteDescription({ type: 'answer', sdp: sdp.sdp });
                await applyPendingCandidates(conn);
            }
        } catch (e) {
            console.error('[Call] handle SDP failed:', e);
            void failCall('通话建立失败');
        }
    }

    function onIce(ice: ImTypes.CallIce) {
        candidatesReceived++;
        const init: RTCIceCandidateInit = {
            candidate: ice.candidate,
            sdpMid: ice.sdp_mid || undefined,
            sdpMLineIndex: ice.sdp_mline_index,
            usernameFragment: ice.username_fragment || undefined,
        };
        if (!pc?.remoteDescription) {
            pendingCandidates.push(init);
            return;
        }
        void addCandidate(pc, init);
    }

    function onEnded(reason: ImTypes.CallEndReason) {
        if (phase.value === 'ended') return;
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
                onIce(ice);
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
            console.error('[Call] handle signal failed:', e);
        }
    });

    // ── 用户操作 ────────────────────────────────────────────────────────────

    /** 呼出：发 invite，等 CALL_ACCEPT 再产生 offer */
    async function startCall() {
        try {
            // 先拿到麦克风再发邀请：对方接起来才发现这边没法说话更糟
            await ensureLocalStream();
            if (!(await callService.invite(opts.peerId, opts.sessionKey, opts.mediaType))) {
                throw new Error('invite signal not sent');
            }
            startRinging();
        } catch (e) {
            console.error('[Call] start call failed:', e);
            // 麦克风失败时 errorText 已由 ensureLocalStream 写好；失败也要收尾，否则麦克风一直占着
            void failCall(errorText.value || '网络未连接，无法发起通话');
        }
    }

    async function acceptCall() {
        if (phase.value !== 'ringing' || !callId.value) return;
        stopRinging();
        // 立刻离开 ringing：接听按钮随之隐藏，连点也不会再进来
        enterConnecting();

        try {
            await setupPeer();
            if (!(await callService.accept(callId.value))) {
                throw new Error('accept signal not sent');
            }
        } catch (e) {
            console.error('[Call] accept failed:', e);
            void failCall(errorText.value || '接听失败，请检查网络后重试');
        }
    }

    /** 挂断 / 取消 / 拒接统一入口，服务端按状态归一 */
    async function hangup() {
        if (phase.value !== 'ended' && callId.value) {
            await callService.hangup(callId.value, durationSeconds);
        }
        phase.value = 'ended';
        cleanup();
        window.close();
    }

    /**
     * 本端判定通话无法继续（麦克风不可用、网络建不起来）：通知对端挂断并收尾。
     * 比正常结束多留几秒，让用户看清失败原因。
     */
    async function failCall(message: string) {
        if (phase.value === 'ended') return;
        console.warn(`[Call] failed: ${message}, candidates sent/received: ${candidatesSent}/${candidatesReceived}`);
        errorText.value = message;
        phase.value = 'ended';
        if (callId.value) await callService.hangup(callId.value, durationSeconds);
        cleanup();
        setTimeout(() => window.close(), CALL_CONFIG.errorCloseDelayMs);
    }

    function toggleMute() {
        isMuted.value = !isMuted.value;
        localStream?.getAudioTracks().forEach((t) => (t.enabled = !isMuted.value));
        // camera_on 恒为 false：本端不再采集视频
        if (callId.value) {
            void callService.sendMediaUpdate(callId.value, false, !isMuted.value);
        }
    }

    // ── 清理 ────────────────────────────────────────────────────────────────

    function cleanup() {
        disposed = true;
        stopRinging();
        stopDurationTimer();
        clearConnectTimer();
        stopFollowingDefaultMic();
        localStream?.getTracks().forEach((t) => t.stop());
        localStream = null;
        remoteStream.value = null;
        pc?.close();
        pc = null;
        pendingCandidates = [];
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

    void loadPeerInfo();
    // 来电：窗口一打开就响铃（呼出侧的回铃音在 invite 发送成功后才起，见 startCall）
    if (opts.isIncoming) startRinging();

    return {
        phase,
        endReason,
        isMuted,
        peerMicOn,
        networkWeak,
        remoteStream,
        errorText,
        formattedDuration,
        startCall,
        acceptCall,
        hangup,
        toggleMute,
    };
}
