<template>
  <div class="logo-area">
    <img :src="icon" alt="logo" class="logo-icon">
    <h1 class="logo-text">ChatHub</h1>
  </div>
</template>

<script setup lang="ts">
const icon = '/icon/icon_' + import.meta.env.VITE_ICON_VERSION + '.png'
</script>

<style scoped lang="scss">
.logo-area {
  display: flex;
  align-items: center;
  gap: 12px;

  .logo-icon {
    width: 40px;
    height: 40px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(to bottom right, #e6eeff, #E0F2FE);

    svg {
      width: 28px;
      height: 28px;
    }
  }

  .logo-text {
    font-size: 32px;
    font-weight: 700;
    background: linear-gradient(to right, #2ba3fe 0%, #3252fc 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    margin: 0;
  }
}
</style>
