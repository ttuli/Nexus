<template>
  <div class="group-call-container">
    <!-- 头部信息 -->
    <div class="header">
      <div class="group-info">
        <span class="title">群组视频通话</span>
        <span class="duration" v-if="isConnected">{{ formattedDuration }}</span>
      </div>
    </div>

    <!-- 视频网格区域 -->
    <div class="video-grid" :class="gridClass">
      <div class="video-item" v-for="participant in participants" :key="participant.id">
        <video
          v-if="participant.videoAttached"
          class="video-element"
          autoplay
          playsinline
          :muted="participant.isLocal"
        ></video>
        <div v-else class="video-placeholder">
          <div class="avatar-placeholder">{{ participant.name[0] }}</div>
        </div>
        <div class="participant-info">
          <span class="name">{{ participant.name }}</span>
          <span class="mute-icon" v-if="participant.isMuted">🔇</span>
        </div>
      </div>
    </div>

    <CallControlBar
      :is-muted="isMuted"
      :is-incoming="isIncoming"
      :is-connected="isConnected"
      :show-screen-share="true"
      @toggle-mute="toggleMute"
      @hangup="hangup"
      @accept="acceptCall"
      @toggle-screen-share="toggleScreenShare"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue';
import CallControlBar from './components/CallControlBar.vue';

interface Participant {
  id: string;
  name: string;
  isLocal: boolean;
  videoAttached: boolean;
  isMuted: boolean;
}

// 群通话第一版不接信令：状态平面要维护 N 个参与者各自的 joined/left，复杂度跳一档。
// 此处为纯 UI 占位，不复用 useCallState（那是私聊单对端的 PeerConnection 控制器）。
const isConnected = ref(false);
const isMuted = ref(false);
const formattedDuration = ref('00:00');
const toggleMute = () => { isMuted.value = !isMuted.value; };
const hangup = () => window.close();
const acceptCall = () => { isConnected.value = true; };
const stopDurationTimer = () => { };

const isIncoming = ref(false); // 是否是被叫方

// 模拟参与者数据
const participants = ref<Participant[]>([
  { id: '1', name: '我', isLocal: true, videoAttached: false, isMuted: false },
  // 随着其他人加入，动态 push 到这个数组
]);

// 根据人数动态计算网格布局类名
const gridClass = computed(() => {
  const count = participants.value.length;
  if (count === 1) return 'grid-1';
  if (count === 2) return 'grid-2';
  if (count <= 4) return 'grid-4';
  if (count <= 9) return 'grid-9';
  return 'grid-auto';
});

const toggleScreenShare = () => {
  // TODO: callService.toggleScreenShare()
};

onUnmounted(() => {
  stopDurationTimer();
});
</script>

<style scoped lang="scss">
@use "@/src/style/_constant.scss" as *;

.group-call-container {
  width: 100vw;
  height: 100vh;
  background-color: #1a1a1a;
  display: flex;
  flex-direction: column;
  color: white;

  .header {
    height: 60px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(to bottom, rgba(0, 0, 0, 0.8), transparent);
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    z-index: 10;

    .group-info {
      text-align: center;

      .title {
        font-size: 16px;
        font-weight: 500;
      }

      .duration {
        display: block;
        font-size: 12px;
        color: rgba(255, 255, 255, 0.7);
        margin-top: 4px;
      }
    }
  }

  .video-grid {
    flex: 1;
    display: grid;
    gap: 10px;
    padding: 20px;
    padding-top: 60px;
    padding-bottom: 100px;
    place-content: center;

    &.grid-1 { grid-template-columns: 1fr; }
    &.grid-2 { grid-template-columns: repeat(2, 1fr); }
    &.grid-4 { grid-template-columns: repeat(2, 1fr); grid-template-rows: repeat(2, 1fr); }
    &.grid-9 { grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(3, 1fr); }
    &.grid-auto {
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      align-content: start;
    }

    .video-item {
      position: relative;
      background-color: #2c2c2c;
      border-radius: 12px;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      aspect-ratio: 16 / 9;

      .video-element {
        width: 100%;
        height: 100%;
        object-fit: cover;
        pointer-events: none;

        &::-webkit-media-controls {
          display: none !important;
        }
      }

      .video-placeholder {
        .avatar-placeholder {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          background-color: #555;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
        }
      }

      .participant-info {
        position: absolute;
        bottom: 10px;
        left: 10px;
        background: rgba(0, 0, 0, 0.6);
        padding: 4px 10px;
        border-radius: 12px;
        font-size: 12px;
        display: flex;
        align-items: center;
        gap: 6px;
      }
    }
  }
}
</style>
