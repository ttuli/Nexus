<template>
  <button
    class="theme-toggle"
    :class="{ 'is-dark': isDark }"
    @click="toggleTheme"
    :aria-label="isDark ? '切换至亮色模式' : '切换至暗色模式'"
  >
    <div class="icon-wrapper">
      <!-- Moon Icon (Visible in dark mode) -->
      <svg
        class="icon moon-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
      </svg>
      <!-- Sun Icon (Visible in light mode) -->
      <svg
        class="icon sun-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2" />
        <path d="M12 20v2" />
        <path d="m4.93 4.93 1.41 1.41" />
        <path d="m17.66 17.66 1.41 1.41" />
        <path d="M2 12h2" />
        <path d="M20 12h2" />
        <path d="m6.34 17.66-1.41 1.41" />
        <path d="m19.07 4.93-1.41 1.41" />
      </svg>
    </div>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useTheme } from '@/src/composables/useTheme'

const { theme, applyTheme } = useTheme()

const isDark = computed(() => theme.value === 'dark')

const toggleTheme = () => {
  applyTheme(theme.value === 'dark' ? 'light' : 'dark')
}
</script>

<style scoped lang="scss">
@use "@/src/style/_constant.scss" as *;

.theme-toggle {
  -webkit-app-region: no-drag;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background-color: var(--surface-default, #ffffff);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  padding: 0;
  position: relative;
  overflow: hidden;
  box-shadow: var(--shadow-sm);

  &:hover {
    color: var(--text-primary);
    background-color: var(--bg-hover);
    border-color: var(--border-hover);
  }

  .icon-wrapper {
    position: relative;
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .icon {
    width: 16px;
    height: 16px;
    transition: transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1), 
                opacity 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
    flex-shrink: 0;
  }

  .moon-icon {
    transform: scale(0);
    opacity: 0;
  }

  .sun-icon {
    position: absolute;
    transform: scale(1);
    opacity: 1;
  }

  &.is-dark {
    .moon-icon {
      transform: scale(1);
      opacity: 1;
    }

    .sun-icon {
      transform: scale(0);
      opacity: 0;
    }
  }
}
</style>
