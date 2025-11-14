<template>
  <div class="settings-items">
    <div class="setting-item" @click="emit('profile')">
      <div class="setting-icon">👤</div>
      <div class="setting-text">个人资料</div>
    </div>
    <div class="setting-item" @click="emit('notification')">
      <div class="setting-icon">🔔</div>
      <div class="setting-text">通知设置</div>
    </div>
    <div class="setting-item" @click="emit('theme')">
      <div class="setting-icon">🎨</div>
      <div class="setting-text">主题设置</div>
    </div>
    <div class="setting-item" @click="emit('logout')">
      <div class="setting-icon">🚪</div>
      <div class="setting-text">退出登录</div>
    </div>
  </div>
</template>

<script setup lang="ts">
const emit = defineEmits<{
  (e: 'profile'): void
  (e: 'notification'): void
  (e: 'theme'): void
  (e: 'logout'): void
}>()
</script>

<style scoped>
.setting-item {
  display: flex;
  align-items: center;
  padding: 15px 20px;
  cursor: pointer;
  transition: background 0.2s;
  border-bottom: 1px solid #f1f3f4;
}

.setting-item:hover {
  background: #f8f9fa;
}

.setting-icon {
  font-size: 20px;
  margin-right: 15px;
}

.setting-text {
  font-size: 14px;
  color: #2c3e50;
}
</style>