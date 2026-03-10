<template>
  <div class="private-call-container">
    <div class="video-grid">
      <div class="remote-video-container" id="remote-video">
        <video v-if="remoteVideoAttached" class="video-element" autoplay playsinline></video>
        <div v-else class="video-placeholder">
          <Avatar :uid="Number(targetId)" :width="'120px'" :height="'120px'" />
          <span class="name">{{ userName }}</span>
        </div>
      </div>

      <!-- 本地视频流（小窗显示在右下角） -->
      <div class="local-video-container" id="local-video" v-if="localVideoAttached">
        <video class="video-element" autoplay playsinline muted></video>
      </div>
    </div>

    <!-- 通话控制栏 -->
    <div class="control-bar">
      <div class="call-info">
        <span class="status">{{ callStatusText }}</span>
        <span class="duration" v-if="isConnected">{{ formattedDuration }}</span>
      </div>

      <div class="actions">
        <button class="action-btn" :class="{ 'is-active': isMuted }" @click="toggleMute">
          <span class="icon">🎙️</span>
        </button>
        <button class="action-btn" :class="{ 'is-active': !isVideoEnabled }" @click="toggleVideo">
          <span class="icon">📹</span>
        </button>
        <!-- 拒绝/挂断按钮 -->
        <button class="action-btn hangup-btn" @click="hangup">
          <span class="icon">📞</span>
        </button>
        <!-- 接听按钮 (如果是被叫方且尚未接听) -->
        <button class="action-btn accept-btn" v-if="isIncoming && !isConnected" @click="acceptCall">
          <span class="icon">📞</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, onUnmounted } from 'vue';
import Avatar from '@/components/Avatar.vue';
import { useUserStore } from '@/store/user';
import { userService } from '@/services';

const userStore = useUserStore();
const props = defineProps<{
  fromId: number;
  targetId: number;
}>();

const isCalling = computed(() => {
  return props.fromId === userStore.getUserID();
})
const isConnected = ref(false);
const isIncoming = computed(() => {
  return userStore.getUserID() === props.targetId;
}) // 是否是接收方
const isMuted = ref(false);
const isVideoEnabled = ref(true);
const formattedDuration = ref('00:00');
const userName = computed(() => {
  return userStore.getUser(props.targetId)?.user_name;
});

// 视频元素是否已经附加了媒体流
const localVideoAttached = ref(false);
const remoteVideoAttached = ref(false);

const callStatusText = computed(() => {
  if (isConnected.value) return '通话中';
  return isIncoming.value ? '邀请你进行视频通话...' : '正在呼叫...';
});

const toggleMute = () => {
    isMuted.value = !isMuted.value;
    // TODO: 调用 callService 禁用/启用麦克风
};

const toggleVideo = () => {
    isVideoEnabled.value = !isVideoEnabled.value;
    // TODO: 调用 callService 禁用/启用摄像头
};

const hangup = () => {
    // TODO: 调用 callService 挂断
};

const acceptCall = () => {
    // TODO: 调用 callService 接听
    isConnected.value = true;
};

let ringAudio: HTMLAudioElement | null = null;

watch(isCalling, (newVal) => {
  if (newVal) {
    if (!ringAudio) {
      ringAudio = new Audio('/phonering.wav');
      ringAudio.loop = true;
    }
    ringAudio.play().catch(e => console.warn('Failed to play ring audio:', e));
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
  // background-color: #1a1a1a;
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
        top: 8%;
        pointer-events: none;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 20px;
        
        .name {
          font-size: 14px;
          color: rgba(255,255,255,0.8);
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
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      border: 2px solid rgba(255,255,255,0.2);

      .video-element {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
    }
  }

  .control-bar {
    position: absolute;
    bottom: 40px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 15px;
    background: rgba(0, 0, 0, 0.6);
    padding: 20px 40px;
    border-radius: 20px;
    backdrop-filter: blur(10px);

    .call-info {
      display: flex;
      flex-direction: column;
      align-items: center;
      
      .status {
        font-size: 14px;
        color: rgba(255,255,255,0.8);
      }
      .duration {
        font-size: 18px;
        font-weight: bold;
      }
    }

    .actions {
      display: flex;
      gap: 20px;

      .action-btn {
        width: 50px;
        height: 50px;
        border-radius: 50%;
        border: none;
        background-color: rgba(255,255,255,0.2);
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
        cursor: pointer;
        transition: all 0.3s;
        -webkit-app-region: no-drag;

        &:hover {
          background-color: rgba(255,255,255,0.3);
        }

        &.is-active {
           background-color: white;
           color: #333;
        }

        &.hangup-btn {
          background-color: #ff4d4f;
          transform: rotate(135deg);
          &:hover { background-color: #ff7875; }
        }

        &.accept-btn {
          background-color: #52c41a;
          &:hover { background-color: #73d13d; }
        }
      }
    }
  }
}
</style>
