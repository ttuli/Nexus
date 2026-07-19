<template>
  <Transition name="badge-zoom">
    <span v-if="visible" :class="['cus-badge', { 'is-dot': isDot }]" :key="displayValue">
      <template v-if="!isDot">{{ displayValue }}</template>
    </span>
  </Transition>
</template>

<script setup lang="ts">
import { computed } from 'vue';

defineOptions({ name: 'Badge' });

const props = withDefaults(
  defineProps<{
    value?: number | string;
    max?: number;
    isDot?: boolean;
    hidden?: boolean;
  }>(),
  {
    value: '',
    max: 99,
    isDot: false,
    hidden: false,
  }
);

const visible = computed(() => {
  if (props.hidden) return false;
  if (props.isDot) return true;
  if (typeof props.value === 'number') {
    return props.value > 0;
  }
  return props.value !== undefined && props.value !== null && props.value !== '';
});

const displayValue = computed(() => {
  if (props.isDot) return '';
  if (typeof props.value === 'number' && typeof props.max === 'number') {
    return props.value > props.max ? `${props.max}+` : props.value;
  }
  return props.value;
});
</script>

<style scoped lang="scss">
.cus-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  color: #ffffff;
  background: linear-gradient(135deg, #ff6b6b, #ff4757);
  border-radius: 50%;
  box-shadow: 0 2px 4px rgba(255, 71, 87, 0.3);
  transform: scale(0.9);
  transform-origin: center;

  &.is-dot {
    min-width: 8px;
    width: 8px;
    height: 8px;
    padding: 0;
    border-radius: 50%;
  }
}

/* Zoom Transition for Badge */
.badge-zoom-enter-active {
  animation: popIn 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.badge-zoom-leave-active {
  animation: popOut 0.25s cubic-bezier(0.6, -0.28, 0.735, 0.045) forwards;
}

@keyframes popIn {
  0% {
    transform: scale(0);
    opacity: 0;
  }
  100% {
    transform: scale(0.9);
    opacity: 1;
  }
}

@keyframes popOut {
  0% {
    transform: scale(0.9);
    opacity: 1;
  }
  100% {
    transform: scale(0);
    opacity: 0;
  }
}
</style>
