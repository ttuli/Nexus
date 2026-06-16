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
@use "@/src/style/_constant.scss" as *;
@use "@/src/style/_mixins.scss" as *;

.custom-button {
  -webkit-app-region: no-drag;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  height: 38px;
  padding: 0 16px;
  border-radius: var(--radius-md, 6px);
  border: 1px solid transparent;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.25, 0.8, 0.25, 1);
  outline: none;
  box-sizing: border-box;

  .button-text {
    flex: 1;
    text-align: center;
  }

  .icon-arrow {
    font-size: 16px;
  }

  &:hover:not(:disabled) {
    opacity: 0.85;
  }

  &:active:not(:disabled) {
    transform: scale(0.98);
  }

  // --- Primary 风格 ---
  &.primary {
    @include primary-button;
    // Overriding height to inherit from .custom-button
    height: 38px;
    
    // Gradient lines for extra flair
    position: relative;
    overflow: hidden;

    .bottom-gradient-line {
      display: block;
      position: absolute;
      height: 2px;
      width: 100%;
      bottom: 0;
      left: 0;
      background: linear-gradient(90deg, transparent, #00f2fe, transparent);
      opacity: 0;
      transition: opacity 0.5s ease;
    }

    .bottom-gradient-blur {
      display: block;
      position: absolute;
      height: 4px;
      width: 50%;
      left: 25%;
      bottom: 0;
      background: linear-gradient(90deg, transparent, #4facfe, transparent);
      filter: blur(4px);
      opacity: 0;
      transition: opacity 0.5s ease;
    }

    &:hover:not(:disabled) {
      .bottom-gradient-line, .bottom-gradient-blur {
        opacity: 1;
      }
    }
  }

  // --- Normal 风格 ---
  &.normal {
    background: var(--surface-default, #ffffff);
    color: $color-text-secondary;
    border-color: $color-border-divider;

    &:hover:not(:disabled) {
      color: $color-primary;
      border-color: var(--color-primary-light);
      background: var(--color-primary-bg);
      opacity: 1;
    }
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
        background: currentColor;
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