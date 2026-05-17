<template>
  <div class="control-bar">
    <div class="actions">
      <template v-if="isConnected">
        <button class="action-btn" :class="{ 'is-active': !isMuted }" @click="emit('toggle-mute')" :title="isMuted ? '打开麦克风' : '关闭麦克风'">
          <img class="icon" :src="Microphone"></img>
        </button>
        <button class="action-btn" :class="{ 'is-active': isVideoEnabled }" @click="emit('toggle-video')" :title="isVideoEnabled ? '关闭摄像头' : '开启摄像头'">
          <img class="icon" :src="Camera"></img>
        </button>
        <button v-if="showScreenShare" class="action-btn" @click="emit('toggle-screen-share')" title="共享屏幕">
          <img class="icon">💻</img>
        </button>
      </template>
      <!-- 拒绝/挂断 -->
      <button class="action-btn hangup-btn" @click="emit('hangup')" :title="isIncoming && !isConnected ? '拒绝' : '挂断'">
        <img class="icon" :src="Phone"></img>
      </button>
      <!-- 接听 (被叫方且未接听时显示) -->
      <button class="action-btn accept-btn" v-if="isIncoming && !isConnected" @click="emit('accept')" title="接听">
        <img class="icon" :src="Phone"></img>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import Microphone from '@/assets/call/Microphone.svg?url'
import Camera from '@/assets/call/VideoCamera.svg?url'
import Phone from '@/assets/call/phone.svg?url'

defineProps<{
  isMuted: boolean;
  isVideoEnabled: boolean;
  isIncoming: boolean;
  isConnected: boolean;
  showScreenShare?: boolean;
}>();

const emit = defineEmits<{
  (e: 'toggle-mute'): void;
  (e: 'toggle-video'): void;
  (e: 'hangup'): void;
  (e: 'accept'): void;
  (e: 'toggle-screen-share'): void;
}>();
</script>

<style scoped lang="scss">
.control-bar {
  position: absolute;
  bottom: 40px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 15px;
  background: transparent;
  padding: 20px 40px;
  border-radius: 20px;
  backdrop-filter: blur(10px);

  .actions {
    display: flex;
    gap: 20px;

    .action-btn {
      width: 65px;
      height: 65px;
      border-radius: 50%;
      border: none;
      background-color: rgba(255, 255, 255, 0.2);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      cursor: pointer;
      transition: all 0.3s;
      -webkit-app-region: no-drag;

      .icon {
        filter: invert(90%);
        width: 32px;
        height: 32px;
        user-select: none;
        -webkit-user-drag: none;
        pointer-events: none;
      }

      &:hover {
        background-color: rgba(255, 255, 255, 0.3);
      }

      &.is-active {
        background-color: rgba(235, 235, 235, 0.9);
        
        .icon {
          filter: none;
        }
      }

      &.hangup-btn {
        background-color: #ff4d4f;
        transform: rotate(135deg);

        &:hover {
          background-color: #ff7875;
        }
      }

      &.accept-btn {
        background-color: #52c41a;

        &:hover {
          background-color: #73d13d;
        }
      }
    }
  }
}
</style>
