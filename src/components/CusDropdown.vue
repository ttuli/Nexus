<template>
  <div class="cus-dropdown" ref="dropdownRef">
    <!-- Trigger Button -->
    <button
      type="button"
      @click="toggleDropdown"
      class="cus-dropdown__trigger"
    >
      <span v-if="selectedOption?.icon" class="cus-dropdown__icon">{{ selectedOption.icon }}</span>
      <span class="cus-dropdown__label">{{ selectedOption?.label || placeholder }}</span>
      <span class="cus-dropdown__chevron">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" :class="{ 'is-open': isOpen }"><polyline points="6 9 12 15 18 9"/></svg>
      </span>
    </button>

    <!-- Dropdown Menu -->
    <transition name="fade-slide">
      <div v-if="isOpen" class="cus-dropdown__menu">
        <button
          v-for="opt in options"
          :key="String(opt.value)"
          type="button"
          @click="selectOption(opt)"
          class="cus-dropdown__item"
          :class="{ 'is-active': opt.value === modelValue }"
        >
          <span v-if="opt.icon" class="cus-dropdown__item-icon">{{ opt.icon }}</span>
          <span class="cus-dropdown__item-label">{{ opt.label }}</span>
          <span v-if="opt.value === modelValue" class="cus-dropdown__check">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </span>
        </button>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';

interface DropdownOption {
  value: any;
  label: string;
  icon?: string;
}

const props = withDefaults(
  defineProps<{
    modelValue: any;
    options: DropdownOption[];
    placeholder?: string;
  }>(),
  {
    placeholder: '请选择',
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: any): void;
  (e: 'change', value: any): void;
}>();

const isOpen = ref(false);
const dropdownRef = ref<HTMLElement | null>(null);

const selectedOption = computed(() => {
  return props.options.find(opt => opt.value === props.modelValue) || null;
});

const toggleDropdown = () => {
  isOpen.value = !isOpen.value;
};

const selectOption = (opt: DropdownOption) => {
  emit('update:modelValue', opt.value);
  emit('change', opt.value);
  isOpen.value = false;
};

const handleClickOutside = (e: MouseEvent) => {
  if (dropdownRef.value && !dropdownRef.value.contains(e.target as Node)) {
    isOpen.value = false;
  }
};

onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('mousedown', handleClickOutside);
});
</script>

<style scoped lang="scss">
@use "@/src/style/_constant.scss" as *;

.cus-dropdown {
  position: relative;
  display: inline-block;
  width: 100%;
  
  &__trigger {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    height: 38px;
    padding: 0 16px;
    border-radius: var(--radius-md, 8px);
    border: 1px solid var(--border-color);
    background-color: var(--bg-card);
    color: var(--text-primary);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.25s ease;
    box-sizing: border-box;
    text-align: left;
    outline: none;
    
    &:hover {
      background-color: var(--bg-hover);
      border-color: var(--border-hover);
    }
    
    &:focus {
      border-color: var(--color-primary);
      box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.12);
    }
  }

  &__icon {
    font-size: 16px;
    flex-shrink: 0;
  }

  &__label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__chevron {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
    transition: transform 0.25s ease;
    flex-shrink: 0;

    svg {
      transition: transform 0.25s ease;
      
      &.is-open {
        transform: rotate(180deg);
      }
    }
  }

  &__menu {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    width: 100%;
    max-height: 200px;
    overflow-y: auto;
    background-color: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md, 8px);
    box-shadow: var(--shadow-md, 0 4px 12px rgba(0, 0, 0, 0.08));
    z-index: 1000;
    padding: 4px;
    box-sizing: border-box;
    
    &::-webkit-scrollbar {
      width: 4px;
    }
    &::-webkit-scrollbar-thumb {
      background-color: rgba(0, 0, 0, 0.1);
      border-radius: 2px;
    }
  }

  &__item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 12px;
    border: none;
    background: none;
    color: var(--text-primary);
    font-size: 13px;
    text-align: left;
    cursor: pointer;
    border-radius: var(--radius-sm, 4px);
    transition: all 0.2s ease;
    box-sizing: border-box;
    outline: none;
    
    &:hover {
      background-color: var(--bg-hover);
    }
    
    &.is-active {
      background-color: var(--color-primary-bg);
      color: var(--color-primary);
      font-weight: 600;
    }
  }

  &__item-icon {
    font-size: 14px;
    flex-shrink: 0;
  }

  &__item-label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__check {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-primary);
    flex-shrink: 0;
  }
}

// Fade Slide Animation
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
