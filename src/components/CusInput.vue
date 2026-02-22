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
.chat-input-wrapper {
  position: relative;
  -webkit-app-region: no-drag;
  display: flex;
  align-items: center;
  gap: 8px;
  overflow: hidden;

  // 聊天软件风格外观
  width: 100%;
  min-height: 48px;
  border-radius: 14px;
  padding: 6px 10px;
  box-sizing: border-box;
  transition: background-color 0.2s, box-shadow 0.2s;
  background-color: #ffffff;

  &:focus-within {
    background-color: #ffffff;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05); // 聚焦时微微浮起
  }

  .chat-input-field {
    flex: 1; // 占满剩余空间
    border: none;
    outline: none;
    background: transparent;
    font-size: 15px;
    color: #333;
    line-height: 1.5;
    padding: 4px 0;
    background-color: #ffffff;

    &::placeholder {
      color: #999;
    }
  }

  .chat-input-actions {
    width: fit-content;
    height: 100%;
    flex-grow: 0;
    display: flex;
    // align-items: center;
    // flex-shrink: 0; // 防止按钮被挤压
  }
}
</style>