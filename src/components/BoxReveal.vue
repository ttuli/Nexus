<template>
  <div
    ref="containerRef"
    class="box-reveal-container"
    :style="containerStyle"
  >
    <!-- Content wrapper -->
    <div
      class="box-reveal-content"
      :style="contentStyle"
    >
      <slot />
    </div>

    <!-- Sliding reveal box -->
    <div
      class="box-reveal-slide"
      :style="slideStyle"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, nextTick } from 'vue'
import type { CSSProperties } from 'vue'

const props = withDefaults(
  defineProps<{
    width?: string
    boxColor?: string
    duration?: number // in seconds
    delay?: number // in seconds
    overflow?: string
  }>(),
  {
    width: 'fit-content',
    boxColor: '#e5e7eb',
    duration: 0.5,
    delay: 0,
    overflow: 'hidden'
  }
)

const animated = ref(false)
const containerRef = ref<HTMLElement | null>(null)

onMounted(() => {
  // Use IntersectionObserver to start animation when it enters view (like useInView in Framer Motion)
  if (typeof window !== 'undefined' && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            animated.value = true
            observer.disconnect()
          }
        })
      },
      { threshold: 0.05 }
    )

    if (containerRef.value) {
      observer.observe(containerRef.value)
    } else {
      nextTick(() => {
        animated.value = true
      })
    }
  } else {
    // Fallback if IntersectionObserver is not available
    animated.value = true
  }
})

const containerStyle = computed<CSSProperties>(() => {
  return {
    position: 'relative',
    width: props.width,
    overflow: props.overflow as any,
    display: props.width === '100%' ? 'block' : 'inline-block'
  }
})

const contentStyle = computed<CSSProperties>(() => {
  if (!animated.value) {
    return {
      opacity: 0,
      transform: 'translateY(40px)',
      width: '100%'
    }
  }
  // Content delay = props.delay + 0.2s to stagger after the overlay starts sweeping
  const contentDelay = props.delay + 0.2
  return {
    width: '100%',
    opacity: 1,
    transform: 'translateY(0)',
    animationName: 'box-reveal-content',
    animationDuration: `${props.duration}s`,
    animationDelay: `${contentDelay}s`,
    animationTimingFunction: 'cubic-bezier(0.25, 1, 0.5, 1)',
    animationFillMode: 'both'
  }
})

const slideStyle = computed<CSSProperties>(() => {
  if (!animated.value) {
    return {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 20,
      backgroundColor: props.boxColor,
      borderRadius: '4px',
      opacity: 1
    }
  }
  return {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    backgroundColor: props.boxColor,
    borderRadius: '4px',
    animationName: 'box-reveal-slide',
    animationDuration: `${props.duration}s`,
    animationDelay: `${props.delay}s`,
    animationTimingFunction: 'cubic-bezier(0.25, 1, 0.5, 1)',
    animationFillMode: 'both'
  }
})
</script>

<style>
@keyframes box-reveal-content {
  from {
    opacity: 0;
    transform: translateY(40px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes box-reveal-slide {
  0% {
    left: 0;
    right: 0;
  }
  100% {
    left: 100%;
    right: 0;
  }
}
</style>
