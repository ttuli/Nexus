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
      <!-- 渲染所有参与者的视频块 -->
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

    <!-- 通话控制栏 -->
    <div class="control-bar">
      <div class="actions">
        <button class="action-btn" :class="{ 'is-active': isMuted }" @click="toggleMute">
          <span class="icon">🎙️</span>
        </button>
        <button class="action-btn" :class="{ 'is-active': !isVideoEnabled }" @click="toggleVideo">
          <span class="icon">📹</span>
        </button>
        <button class="action-btn screen-share-btn" @click="toggleScreenShare">
          <span class="icon">💻</span>
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
import { ref, computed } from 'vue';

interface Participant {
  id: string;
  name: string;
  isLocal: boolean;
  videoAttached: boolean;
  isMuted: boolean;
}

const isConnected = ref(false);
const isIncoming = ref(false); // 是否是被叫方
const isMuted = ref(false);
const isVideoEnabled = ref(true);
const formattedDuration = ref('00:00');

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

const toggleMute = () => {
    isMuted.value = !isMuted.value;
    // TODO: 调用 callService 禁用/启用麦克风
};

const toggleVideo = () => {
    isVideoEnabled.value = !isVideoEnabled.value;
    // TODO: 调用 callService 禁用/启用摄像头
};

const toggleScreenShare = () => {
    // TODO: 调用 livekit 开启屏幕共享
};

const hangup = () => {
    // TODO: 调用 callService 挂断
    console.log('Hangup call');
};

const acceptCall = () => {
    // TODO: 调用 callService 接听
    console.log('Accept call');
    isConnected.value = true;
};
</script>

<style scoped lang="scss">
@use "@/style/_constant.scss" as *;

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
    background: linear-gradient(to bottom, rgba(0,0,0,0.8), transparent);
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
        color: rgba(255,255,255,0.7);
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
        background: rgba(0,0,0,0.6);
        padding: 4px 10px;
        border-radius: 12px;
        font-size: 12px;
        display: flex;
        align-items: center;
        gap: 6px;
      }
    }
  }

  .control-bar {
    position: absolute;
    bottom: 40px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.6);
    padding: 15px 30px;
    border-radius: 20px;
    backdrop-filter: blur(10px);
    z-index: 10;

    .actions {
      display: flex;
      gap: 20px;

      .action-btn {
        width: 48px;
        height: 48px;
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
