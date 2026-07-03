<template>
  <div class="call-window-wrapper">
    <!-- 动态根据当前通话类型渲染界面 -->
    <TitleBar theme="dark" :needMax="true"></TitleBar>
    <PrivateCall v-if="callType === 'private'" 
    class="main-content" 
    :target-id="currentTargetId"
    :fromId="fromId" />
    <GroupCall v-else-if="callType === 'group'" class="main-content" :target-id="currentTargetId" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import PrivateCall from './PrivateCall.vue';
import GroupCall from './GroupCall.vue';
import { useRoute } from 'vue-router';
import { signalWindowReady } from '@/src/utils/window';

// 决定显示一对一还是一对多
const callType = ref<'private' | 'group'>('private');
const currentTargetId = ref<number>(0);
const fromId = ref<number>(0);

onMounted(() => {
    const route = useRoute();
    currentTargetId.value = Number(route.query.targetId);
    const targetType = route.query.targetType as string;
    fromId.value = Number(route.query.fromId);
    callType.value = targetType as 'private' | 'group';

    signalWindowReady()
});
</script>

<style scoped lang="scss">
.call-window-wrapper {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  right: 0;
  background-color: #1a1a1a;
  display: flex;
  flex-direction: column;
  gap: 0;

  .main-content {
    width: 100%;
    height: 100%;
  }
}
</style>
