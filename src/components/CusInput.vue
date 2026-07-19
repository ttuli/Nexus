<template>
  <div class="chat-input-wrapper">
    <div class="chat-input-actions">
      <slot name="left-area"></slot>
    </div>

    <input
      ref="inputRef"
      class="chat-input-field"
      :type="actualType"
      :value="modelValue"
      :placeholder="placeholder"
      @input="handleInput"
      @keydown.enter="handleEnter"
      @focus="emit('focus')"
      @blur="emit('blur')"
    />

    <div class="chat-input-actions">
      <slot name="right-area"></slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

// 定义 Props
interface Props {
  modelValue: string;
  placeholder?: string;
  type?: 'text' | 'password';
  visible?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '请输入消息...',
  type: 'text',
  visible: true,
  modelValue: ''
});

// 定义 Emits
const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'submit', value: string): void;
  (e: 'focus'): void;
  (e: 'blur'): void;
}>();

const inputRef = ref<HTMLInputElement | null>(null);

// 处理输入
const handleInput = (event: Event) => {
  const target = event.target as HTMLInputElement;
  emit('update:modelValue', target.value);
};

// 处理回车发送
const handleEnter = () => {
  if (props.modelValue.trim()) {
    emit('submit', props.modelValue);
  }
};

// 实际类型（用于支持密码可见性切换）
const actualType = computed(() => {
  if (props.type === 'password') {
    return props.visible ? 'text' : 'password';
  }
  return 'text';
});

// 暴露 focus 方法
const focus = () => {
  inputRef.value?.focus();
};

defineExpose({
  focus
});
</script>

<style lang="scss" scoped>
@use "@/src/style/_constant.scss" as *;

.chat-input-wrapper {
  position: relative;
  -webkit-app-region: no-drag;
  display: flex;
  align-items: stretch;
  gap: 8px;
  user-select: none;

  // 聊天软件风格外观
  width: 100%;
  height: 48px;
  border-radius: var(--radius-md, 8px);
  padding: 0 0 0 16px;
  box-sizing: border-box;
  overflow: hidden;
  transition: border-color 0.2s, box-shadow 0.2s, background-color 0.2s;
  background-color: var(--surface-default, #ffffff);
  border: 1px solid $color-border-divider;

  &:focus-within {
    border-color: $color-primary;
    // box-shadow: 0 0 0 3px rgba(24, 144, 255, 0.1);
    background-color: var(--surface-default, #ffffff);
  }

  .chat-input-field {
    flex: 1;
    min-width: 0; // 允许在 flex 容器中收缩至 0，为右侧内容让出空间
    border: none;
    outline: none;
    background: transparent;
    font-size: 15px;
    color: $color-text-title;
    line-height: 1.5;
    padding: 12px 0;
    align-self: center;

    &::placeholder {
      color: $color-text-placeholder;
    }
  }

  .chat-input-actions {
    width: fit-content;
    height: 100%;
    display: flex;
    align-items: center;

    // 左侧 slot 保留左边的间距
    &:first-child {
      padding-right: 0;
    }

    // 右侧 slot 不需要额外内边距，让内容可以贴右边
    &:last-child {
      padding-right: 0;
    }
  }
}
</style>