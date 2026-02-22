<template>
  <button class="custom-button" :class="[type, { 'has-icon': showIcon, 'loading': loading, 'disabled': disabled }]"
    :type="htmlType" :disabled="disabled || loading" @click="handleClick">
    <span v-if="loading" class="loading-spinner">
      <span></span>
      <span></span>
      <span></span>
    </span>
    <span v-else class="button-text">
      <slot></slot>
    </span>
    <span v-if="showIcon && !loading" class="icon-arrow">→</span>
  </button>
</template>

<script setup lang="ts">
interface Props {
  type?: 'primary' | 'normal';
  showIcon?: boolean;
  loading?: boolean;
  disabled?: boolean;
  htmlType?: 'button' | 'submit' | 'reset';
}

const props = withDefaults(defineProps<Props>(), {
  type: 'primary',
  showIcon: true,
  loading: false,
  disabled: false,
  htmlType: 'button'
});

const emit = defineEmits(['click']);

const handleClick = () => {
  if (!props.loading && !props.disabled) {
    emit('click');
  }
};
</script>

<style lang="scss" scoped>
.custom-button {
  -webkit-app-region: no-drag;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 48px;
  border-radius: 14px;
  border: none;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  outline: none;

  .button-text {
    flex: 1;
    text-align: center;
  }

  .icon-arrow {
    font-size: 18px;
    margin-right: 4px;
  }

  &:hover:not(:disabled) {
    box-shadow: 0 8px 20px rgba(27, 27, 27, 0.148);
    transform: translateY(-2px);
  }

  &:active:not(:disabled) {
    transform: translateY(0);
  }

  // --- Primary 风格 (图片中的蓝色) ---
  &.primary {
    background: #3c72f6;
    color: #ffffff;
  }

  // --- Normal 风格 (图片底部的浅灰色文字链接风格) ---
  &.normal {
    background: #ffffff;
    color: #667eea;
    font-size: 14px;
  }

  // --- Loading 状态 ---
  &.loading {
    cursor: not-allowed;
    opacity: 0.7;

    .loading-spinner {
      display: flex;
      gap: 4px;

      span {
        width: 6px;
        height: 6px;
        background: white;
        border-radius: 50%;
        animation: pulse 1.4s infinite;

        &:nth-child(1) {
          animation-delay: 0s;
        }

        &:nth-child(2) {
          animation-delay: 0.2s;
        }

        &:nth-child(3) {
          animation-delay: 0.4s;
        }
      }
    }
  }

  // --- Disabled 状态 ---
  &.disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
}

@keyframes pulse {

  0%,
  100% {
    opacity: 0.4;
  }

  50% {
    opacity: 1;
  }
}
</style>