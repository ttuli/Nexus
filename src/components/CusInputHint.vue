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
  background: #ffffff;
  padding: 12px 16px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  font-size: 13px;
  color: #64748b;
  line-height: 1.6;
  font-weight: 500;
  box-shadow: 0 10px 25px -5px rgba(24, 144, 255, 0.1), 0 8px 10px -6px rgba(24, 144, 255, 0.1);
  max-width: 280px;
  pointer-events: auto;
  
  /* 为了让 p 标签没有默认的多余边距 */
  :deep(p) {
    margin: 0 0 4px 0;
    color: #475569;
    &:first-child {
      font-weight: 600;
      color: #1e293b;
      margin-bottom: 6px;
    }
  }
}

.hint-arrow {
  position: absolute;
  top: -6px;
  left: 20px;
  width: 10px;
  height: 10px;
  background: #ffffff;
  border-top: 1px solid #e2e8f0;
  border-left: 1px solid #e2e8f0;
  transform: rotate(45deg);
  border-radius: 2px;
}

.hint-fade-enter-active,
.hint-fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.hint-fade-enter-from,
.hint-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.95);
}
</style>
