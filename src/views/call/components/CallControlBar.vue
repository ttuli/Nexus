<template>
  <div class="control-bar">
    <!-- 麦克风：关闭时高亮并换成划线图标，外加文字，开关状态一眼可辨 -->
    <div v-if="showMic" class="action">
      <button class="action-btn" :class="{ 'is-off': isMuted }" @click="emit('toggle-mute')">
        <MicrophoneSlash v-if="isMuted" class="app-icon app-icon--md" />
        <Microphone v-else class="app-icon app-icon--md" />
      </button>
      <span class="label">{{ isMuted ? '麦克风已关' : '麦克风已开' }}</span>
    </div>

    <div v-if="showScreenShare" class="action">
      <button class="action-btn" @click="emit('toggle-screen-share')">
        <Monitor class="app-icon app-icon--md" />
      </button>
      <span class="label">共享屏幕</span>
    </div>

    <div class="action">
      <button class="action-btn hangup-btn" @click="emit('hangup')">
        <Phone class="app-icon app-icon--md" />
      </button>
      <span class="label">{{ hangupLabel }}</span>
    </div>

    <div v-if="showAccept" class="action">
      <button class="action-btn accept-btn" @click="emit('accept')">
        <Phone class="app-icon app-icon--md" />
      </button>
      <span class="label">接听</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Microphone, MicrophoneSlash, Phone, Monitor } from 'reicon-vue';

withDefaults(defineProps<{
  isMuted: boolean;
  /** 是否显示麦克风开关（接听后才有意义） */
  showMic: boolean;
  /** 是否显示接听按钮（被叫振铃中） */
  showAccept: boolean;
  /** 挂断按钮文案：振铃中是「拒绝」/「取消」，接听后是「挂断」 */
  hangupLabel?: string;
  showScreenShare?: boolean;
}>(), {
  hangupLabel: '挂断',
  showScreenShare: false,
});

const emit = defineEmits<{
  (e: 'toggle-mute'): void;
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
  gap: 28px;

  .action {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;

    .label {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.7);
      white-space: nowrap;
      user-select: none;
    }
  }

  .action-btn {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    border: none;
    background-color: rgba(255, 255, 255, 0.15);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background-color 0.2s, color 0.2s;
    -webkit-app-region: no-drag;

    &:hover {
      background-color: rgba(255, 255, 255, 0.25);
    }

    // 麦克风已关：白底深色划线图标，与「开着」的半透明态明显区分
    &.is-off {
      background-color: rgba(255, 255, 255, 0.92);
      color: #1a1a1a;

      &:hover {
        background-color: #fff;
      }
    }

    &.hangup-btn {
      background-color: #ff4d4f;

      // 听筒图标朝下即「挂断」
      .app-icon {
        transform: rotate(135deg);
      }

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
</style>
