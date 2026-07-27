<template>
  <div class="call-window-wrapper">
    <!-- 动态根据当前通话类型渲染界面 -->
    <TitleBar theme="dark" :needMax="true"></TitleBar>
    <PrivateCall
      v-if="callType === 'private' && ready"
      class="main-content"
      :call-id="callId"
      :peer-id="peerId"
      :session-key="sessionKey"
      :media-type="mediaType"
      :is-incoming="isIncoming"
    />
    <GroupCall v-else-if="callType === 'group'" class="main-content" :target-id="peerId" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import PrivateCall from './PrivateCall.vue';
import GroupCall from './GroupCall.vue';
import { useRoute } from 'vue-router';
import { signalWindowReady } from '@/src/utils/window';
import { ImTypes } from '@shared/types';

// 窗口参数由主进程以 query 传入（windowManager.loadWindowContent 把 data 序列化为 query）。
// useRoute 必须在 setup 同步阶段调用，不能放进 onMounted。
const route = useRoute();

const callType = ref<'private' | 'group'>((route.query.targetType as any) || 'private');
/** 来电时服务端已下发；呼出时为空，由 CALL_INVITE 回执带回 */
const callId = ref<string>((route.query.callId as string) || '');
const peerId = ref<number>(Number(route.query.peerId ?? route.query.targetId ?? 0));
const sessionKey = ref<string>((route.query.sessionKey as string) || '');
const mediaType = ref<ImTypes.CallMediaType>(
    Number(route.query.mediaType ?? ImTypes.CallMediaType.CALL_MEDIA_TYPE_AUDIO)
);
// query 全是字符串，'0' 也是真值，必须显式比较
const isIncoming = ref<boolean>(String(route.query.isIncoming) === '1');

const ready = ref(true);

signalWindowReady();
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
