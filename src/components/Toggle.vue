<template>
  <button 
    type="button" 
    class="premium-toggle" 
    :class="{ 'is-active': isActive, 'is-disabled': disabled }" 
    :disabled="disabled"
    @click="toggle"
  >
    <div class="toggle-track">
      <div class="toggle-thumb">
        <span class="pulse-ring"></span>
      </div>
    </div>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    modelValue?: any;
    activeValue?: any;
    inactiveValue?: any;
    disabled?: boolean;
  }>(),
  {
    modelValue: false,
    activeValue: true,
    inactiveValue: false,
    disabled: false,
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: any): void;
  (e: 'change', value: any): void;
}>();

const isActive = computed(() => {
  return props.modelValue === props.activeValue;
});

const toggle = () => {
  if (props.disabled) return;
  const newValue = isActive.value ? props.inactiveValue : props.activeValue;
  emit('update:modelValue', newValue);
  emit('change', newValue);
};
</script>

<style scoped lang="scss">
@use "@/src/style/_constant.scss" as *;

.premium-toggle {
  display: inline-flex;
  align-items: center;
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
  outline: none;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
  
  &.is-disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
}

.toggle-track {
  width: 44px;
  height: 24px;
  border-radius: 12px;
  background-color: var(--border-color, #e2e8f0);
  position: relative;
  transition: background-color 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.06);
}

.toggle-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background-color: #ffffff;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.15);
  transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: visible;
}

.pulse-ring {
  position: absolute;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background-color: rgba(24, 144, 255, 0.2);
  opacity: 0;
  transform: scale(1);
  transition: transform 0.3s ease, opacity 0.3s ease;
}

.premium-toggle:hover:not(.is-disabled) {
  .pulse-ring {
    opacity: 1;
    transform: scale(1.4);
  }
}

.premium-toggle.is-active {
  .toggle-track {
    background-color: var(--color-primary, #1890ff);
  }
  
  .toggle-thumb {
    transform: translateX(20px);
  }
}
</style>
