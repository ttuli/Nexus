<template>
  <div class="private-call-container">
    <div class="video-grid">
      <div class="remote-video-container" id="remote-video">
        <video v-if="remoteVideoAttached" class="video-element" autoplay playsinline></video>
        <div v-else class="video-placeholder">
          <Avatar :uid="Number(targetId)" :width="'120px'" :height="'120px'" />
          <span class="name">{{ userName }}</span>
          <div class="call-info">
            <span class="status">{{ callStatusText }}</span>
            <span class="duration" v-if="isConnected">{{ formattedDuration }}</span>
          </div>
        </div>
      </div>

      <!-- 本地视频流（小窗显示在右下角） -->
      <div class="local-video-container" id="local-video" v-if="localVideoAttached">
        <video class="video-element" autoplay playsinline muted></video>
      </div>
    </div>

    <CallControlBar
      :is-muted="isMuted"
      :is-video-enabled="isVideoEnabled"
      :is-incoming="isIncoming"
      :is-connected="isConnected"
      @toggle-mute="toggleMute"
      @toggle-video="toggleVideo"
      @hangup="hangup"
      @accept="acceptCall"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, onUnmounted } from 'vue';
import Avatar from '@/components/Avatar.vue';
import CallControlBar from './components/CallControlBar.vue';
import { useCallState } from './composables/useCallState';
import { useUserStore } from '@/store/user';
import { userService } from '@/services';

const userStore = useUserStore();
const props = defineProps<{
  fromId: number;
  targetId: number;
}>();

const {
  isConnected,
  isMuted,
  isVideoEnabled,
  formattedDuration,
  toggleMute,
  toggleVideo,
  hangup,
  acceptCall,
  stopDurationTimer,
} = useCallState();

const isCalling = computed(() => props.fromId === userStore.getUserID());

const isIncoming = computed(() => userStore.getUserID() === props.targetId);

const userName = computed(() => userStore.getUser(props.targetId)?.user_name);

// 视频元素是否已经附加了媒体流
const localVideoAttached = ref(false);
const remoteVideoAttached = ref(false);

const callStatusText = computed(() => {
  if (isConnected.value) return '通话中';
  return isIncoming.value ? '邀请你进行视频通话' : '正在呼叫...';
});

let ringAudio: HTMLAudioElement | null = null;

watch(isCalling, (newVal) => {
  if (newVal) {
    if (!ringAudio) {
      ringAudio = new Audio('/phonering.wav');
      ringAudio.loop = true;
    }
    // ringAudio.play().catch(e => console.warn('Failed to play ring audio:', e));
  } else {
    if (ringAudio) {
      ringAudio.pause();
      ringAudio.currentTime = 0;
    }
  }
});

onMounted(async () => {
  userService.fetchByIds([props.targetId]);
});

onUnmounted(() => {
  stopDurationTimer();
  if (ringAudio) {
    ringAudio.pause();
    ringAudio = null;
  }
});
</script>

<style scoped lang="scss">
@use "@/style/_constant.scss" as *;

.private-call-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
  color: white;

  .video-grid {
    flex: 1;
    position: relative;

    .remote-video-container {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;

      .video-element {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .video-placeholder {
        position: absolute;
        top: 5%;
        pointer-events: none;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 20px;

        .name {
          font-size: 14px;
          color: rgba(255, 255, 255, 0.8);
        }

        .call-info {
          display: flex;
          flex-direction: column;
          align-items: center;
          margin-top: 10px;

          .status {
            font-size: 14px;
            color: rgba(255, 255, 255, 0.8);
          }

          .duration {
            font-size: 18px;
            font-weight: bold;
          }
        }
      }
    }

    .local-video-container {
      position: absolute;
      right: 20px;
      bottom: 20px;
      width: 120px;
      height: 160px;
      background-color: #333;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      border: 2px solid rgba(255, 255, 255, 0.2);

      .video-element {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
    }
  }
}
</style>
