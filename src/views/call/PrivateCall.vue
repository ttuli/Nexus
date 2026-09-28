<template>
  <div class="private-call-container">
    <div class="call-stage">
      <!-- 仅语音通话：远端音频由隐藏的 <audio> 播放，界面恒为头像 -->
      <audio ref="remoteAudioRef" autoplay></audio>
      <Avatar :uid="peerId" :width="'120px'" :height="'120px'" />
      <span class="name">{{ userName }}</span>
      <div class="call-info">
        <span class="status">{{ callStatusText }}</span>
        <span class="duration" v-if="phase === 'connected'">{{ formattedDuration }}</span>
        <span class="hint" v-if="hintText">{{ hintText }}</span>
      </div>
    </div>

    <div class="error-tip" v-if="errorText">{{ errorText }}</div>

    <CallControlBar
      :is-muted="isMuted"
      :show-mic="inCall"
      :show-accept="isIncoming && phase === 'ringing'"
      :hangup-label="hangupLabel"
      @toggle-mute="toggleMute"
      @hangup="hangup"
      @accept="acceptCall"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import CallControlBar from './components/CallControlBar.vue';
import Avatar from '@/src/components/Avatar.vue';
import { useCallState } from '@/src/composables/useCallState';
import { useUserStore } from '@/src/store/user';
import { ImTypes } from '@shared/types';

const props = defineProps<{
  callId: string;
  peerId: number;
  sessionKey: string;
  mediaType: ImTypes.CallMediaType;
  isIncoming: boolean;
}>();

const userStore = useUserStore();

const {
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
} = useCallState({
  callId: props.callId,
  peerId: props.peerId,
  sessionKey: props.sessionKey,
  mediaType: props.mediaType,
  isIncoming: props.isIncoming,
});

const remoteAudioRef = ref<HTMLAudioElement | null>(null);

const userName = computed(() => userStore.getUser(props.peerId)?.user_name ?? props.peerId);

/** 已接听（含连接中）：麦克风开关此时才有意义 */
const inCall = computed(() => phase.value === 'connecting' || phase.value === 'connected');

const END_REASON_TEXT: Record<number, string> = {
  [ImTypes.CallEndReason.CALL_END_REASON_CANCELED]: '通话已取消',
  [ImTypes.CallEndReason.CALL_END_REASON_REJECTED]: '对方已拒绝',
  [ImTypes.CallEndReason.CALL_END_REASON_MISSED]: '对方无应答',
  [ImTypes.CallEndReason.CALL_END_REASON_PEER_OFFLINE]: '对方不在线',
  [ImTypes.CallEndReason.CALL_END_REASON_BUSY]: '对方忙线中',
  [ImTypes.CallEndReason.CALL_END_REASON_FAILED]: '通话建立失败',
  [ImTypes.CallEndReason.CALL_END_REASON_COMPLETED]: '通话已结束',
};

const callStatusText = computed(() => {
  switch (phase.value) {
    case 'ended':
      return endReason.value !== null ? (END_REASON_TEXT[endReason.value] ?? '通话已结束') : '通话已结束';
    case 'connected':
      return '通话中';
    case 'connecting':
      return '正在连接…';
    case 'ringing':
      return '邀请你语音通话';
    default:
      return '正在呼叫…';
  }
});

/** 通话中的补充提示：自己静音优先，其次对方静音、网络抖动 */
const hintText = computed(() => {
  if (!inCall.value) return '';
  if (isMuted.value) return '你的麦克风已关闭，对方听不到你的声音';
  if (!peerMicOn.value) return '对方已关闭麦克风';
  if (networkWeak.value) return '网络不稳定，正在重连…';
  return '';
});

const hangupLabel = computed(() => {
  if (phase.value === 'ringing') return '拒绝';
  if (phase.value === 'calling') return '取消';
  return '挂断';
});

// 远端流就绪后绑定到 audio 元素播放（元素恒在 DOM 中，ref 稳定）
watch(remoteStream, (stream) => {
  const el = remoteAudioRef.value;
  if (!el) return;
  el.srcObject = stream;
  // autoplay 只在赋值时尝试一次，显式 play 以便播放失败时留下原因
  if (stream) el.play().catch((e) => console.warn('[Call] remote audio play failed:', e));
});

onMounted(() => {
  // 呼出方在挂载后立即发起；来电方等用户点接听
  if (!props.isIncoming) void startCall();
});
</script>

<style scoped lang="scss">
.private-call-container {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #1a1a1a;
  color: #fff;
}

.call-stage {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  // 给底部控制栏留出空间，头像区域视觉居中
  padding-bottom: 120px;

  .name {
    font-size: 18px;
    font-weight: 500;
  }

  .call-info {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    color: rgba(255, 255, 255, 0.7);
    font-size: 14px;

    .hint {
      margin-top: 6px;
      padding: 4px 10px;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.1);
      font-size: 12px;
    }
  }
}

.error-tip {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 150px;
  padding: 8px 16px;
  text-align: center;
  color: #ff7875;
  font-size: 13px;
}
</style>
