<template>
  <Teleport to="body">
    <Transition name="hint-fade">
      <div v-if="visible" ref="hintRef" class="input-hint" :style="hintStyle as any">
        <div class="hint-content">
          <slot></slot>
          <div class="hint-arrow"></div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';

interface Props {
  visible?: boolean;
  targetRef?: { $el: HTMLElement } | null;
  offsetX?: number;
  offsetY?: number;
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  targetRef: null,
  offsetX: 0,
  offsetY: 0
});

const hintRef = ref<HTMLElement | null>(null);

const hintStyle = computed(() => {
  if (!props.targetRef?.$el) return {};

  const targetRect = props.targetRef.$el.getBoundingClientRect();
  const targetBottomY = targetRect.bottom;

  return {
    position: 'absolute',
    top: `${targetBottomY + 8}px`
  };
});

watch(() => props.visible, (newVal) => {
  if (newVal) {
    nextTick(() => {
      if (hintRef.value) {
        const rect = hintRef.value.getBoundingClientRect();
        const targetRect = props.targetRef?.$el?.getBoundingClientRect();

        if (targetRect) {
          const hintWidth = rect.width;
          const goldenRatio = 0.618;

          const leftPosition = targetRect.left + (targetRect.width * goldenRatio) - hintWidth+50;

          hintRef.value.style.left = `${leftPosition}px`;
        }
      }
    });
  }
});
</script>

<style scoped lang="scss">
.input-hint {
  position: fixed;
  z-index: 1000;
  pointer-events: none;
}

.hint-content {
  position: relative;
  background: white;  
  padding: 3px 8px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  box-shadow: 0 4px 20px rgba(102, 126, 234, 0.3);
  max-width: 280px;
  pointer-events: auto;
}

.hint-arrow {
  position: absolute;
  top: -6px;
  left: 20px;
  width: 12px;
  height: 12px;
  border:none;
  background: white;
  transform: rotate(45deg);
  border-radius: 2px;
}

.hint-fade-enter-active,
.hint-fade-leave-active {
  transition: all 0.2s ease;
}

.hint-fade-enter-from,
.hint-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
