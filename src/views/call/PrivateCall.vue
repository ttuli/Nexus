<template>
  <div class="private-call-container">
    <div class="video-grid">
      <div class="remote-video-container">
        <!-- 对端画面：仅在视频通话且对方摄像头开启时显示，否则显示头像占位。
             占位与否由 CALL_MEDIA_UPDATE 驱动，不从 WebRTC 事件推断 -->
        <video
          v-show="isVideoCall && peerCameraOn && isConnected"
          ref="remoteVideoRef"
          class="video-element"
          autoplay
          playsinline
        ></video>
        <div v-if="!(isVideoCall && peerCameraOn && isConnected)" class="video-placeholder">
          <Avatar :uid="peerId" :width="'120px'" :height="'120px'" />
          <span class="name">{{ userName }}</span>
          <div class="call-info">
            <span class="status">{{ callStatusText }}</span>
            <span class="duration" v-if="isConnected">{{ formattedDuration }}</span>
          </div>
        </div>
      </div>

      <!-- 本端画面小窗 -->
      <div class="local-video-container" v-show="isVideoCall && isVideoEnabled">
        <video ref="localVideoRef" class="video-element" autoplay playsinline muted></video>
      </div>
    </div>

    <div class="error-tip" v-if="errorText">{{ errorText }}</div>

    <CallControlBar
      :is-muted="isMuted"
      :is-video-enabled="isVideoEnabled"
      :is-incoming="isIncoming && !isConnected"
      :is-connected="isConnected"
      @toggle-mute="toggleMute"
      @toggle-video="toggleVideo"
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
import { userService } from '@/src/services';
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
  callId,
  isConnected,
  isMuted,
  isVideoEnabled,
  isVideoCall,
  peerCameraOn,
  localStream,
  remoteStream,
  errorText,
  formattedDuration,
  endReason,
  startCall,
  acceptCall,
  hangup,
  toggleMute,
  toggleVideo,
} = useCallState({
  callId: props.callId,
  peerId: props.peerId,
  sessionKey: props.sessionKey,
  mediaType: props.mediaType,
  isIncoming: props.isIncoming,
});

const localVideoRef = ref<HTMLVideoElement | null>(null);
const remoteVideoRef = ref<HTMLVideoElement | null>(null);

const userName = computed(() => userStore.getUser(props.peerId)?.user_name ?? props.peerId);

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
  if (endReason.value !== null) return END_REASON_TEXT[endReason.value] ?? '通话已结束';
  if (isConnected.value) return '通话中';
  if (props.isIncoming) return isVideoCall ? '邀请你视频通话' : '邀请你语音通话';
  return '正在呼叫...';
});

// 媒体流就绪后绑定到 video 元素（v-show 不销毁元素，ref 稳定）
watch(localStream, (s) => {
  if (localVideoRef.value) localVideoRef.value.srcObject = s;
});
watch(remoteStream, (s) => {
  if (remoteVideoRef.value) remoteVideoRef.value.srcObject = s;
});

onMounted(async () => {
  if (userStore.getUser(props.peerId) === undefined) {
    let res = await userService.fetchByIds([props.peerId]);
    res.map((user: ImTypes.UserInfo) => userStore.setUser(user));
  }
  // 呼出方在挂载后立即发起；来电方等用户点接听
  if (!props.isIncoming) void startCall();
});

defineExpose({ callId });
</script>

<style scoped lang="scss">
.private-call-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #1a1a1a;
  color: #fff;
}

.video-grid {
  position: relative;
  flex: 1;
  overflow: hidden;
}

.remote-video-container {
  width: 100%;
  height: 100%;
}

.video-element {
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: #000;
}

.video-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  height: 100%;

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
  }
}

.local-video-container {
  position: absolute;
  right: 16px;
  bottom: 16px;
  width: 140px;
  height: 105px;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
}

.error-tip {
  padding: 8px 16px;
  text-align: center;
  color: #ff7875;
  font-size: 13px;
}
</style>
