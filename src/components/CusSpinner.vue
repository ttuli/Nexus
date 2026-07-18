<template>
  <div class="heroui-spinner-container">
    <div class="spinner-wrapper">
      <i class="spinner-ring ring-ease"></i>
      <i class="spinner-ring ring-linear"></i>
    </div>
    <div v-if="text" class="spinner-label">{{ text }}</div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  text?: string;
}>();
</script>

<style lang="scss" scoped>
@use "@/src/style/_constant.scss" as *;

.heroui-spinner-container {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;

  .spinner-wrapper {
    position: relative;
    display: flex;
    width: 48px;  // Extra Large size
    height: 48px; // Extra Large size

    .spinner-ring {
      position: absolute;
      width: 100%;
      height: 100%;
      border-radius: 50%;
      border: 3.5px solid transparent;
      border-bottom-color: $color-primary; // Using project primary color
      box-sizing: border-box;

      &.ring-ease {
        border-style: solid;
        animation: spinner-spin 0.8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
      }

      &.ring-linear {
        border-style: dotted;
        animation: spinner-spin 0.8s linear infinite;
        opacity: 0.75;
      }
    }
  }

  .spinner-label {
    font-size: 14px;
    color: $color-text-secondary;
    font-weight: 500;
  }
}

@keyframes spinner-spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
</style>
