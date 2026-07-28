<template>
  <div class="call-bubble" :class="{ missed: isMissed }" @click="redial" :title="redialTitle">
    <component :is="isVideo ? Video : CallCalling" class="app-icon app-icon--sm call-icon" />
    <span class="text">{{ text }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { CallCalling, Video } from 'reicon-vue';
import { ImTypes } from '@shared/types';
import type { ILocalCallMessage } from '@shared/types';
import { formatCallMessage } from '@/src/utils/messageConverter';
import { useUserStore } from '@/src/store/user';
import { useSessionStore } from '@/src/store/session';
import { windowService } from '@/src/services';
import { WindowKey } from '@shared/config/windowKeys';
import { CALL_CONFIG } from '@shared/config/constants';
import { extractTargetIdFromSessionId } from '@/src/utils/sessionUtils';

const props = defineProps<{ message: ILocalCallMessage }>();

const userStore = useUserStore();
const sessionStore = useSessionStore();

const isVideo = computed(
  () => props.message.mediaType === ImTypes.CallMediaType.CALL_MEDIA_TYPE_VIDEO
);

const text = computed(() => formatCallMessage(props.message, userStore.getUserID()));

/** 未接来电标红：被叫侧且通话从未接通 */
const isMissed = computed(() => {
  if (props.message.fromUserId === userStore.getUserID()) return false;
  return [
    ImTypes.CallEndReason.CALL_END_REASON_CANCELED,
    ImTypes.CallEndReason.CALL_END_REASON_MISSED,
    ImTypes.CallEndReason.CALL_END_REASON_PEER_OFFLINE,
    ImTypes.CallEndReason.CALL_END_REASON_BUSY,
  ].includes(props.message.endReason);
});

const redialTitle = computed(() => (isVideo.value ? '重拨视频通话' : '重拨语音通话'));

/** 回拨：类型跟随原通话的 media_type */
const redial = () => {
  const sessionKey = props.message.sessionKey || sessionStore.currentSessionKey;
  const peerId = extractTargetIdFromSessionId(sessionKey, userStore.getUserID());
  if (!peerId) return;

  windowService.createWindow(
    WindowKey.Call,
    {
      peerId,
      sessionKey,
      mediaType: props.message.mediaType,
      isIncoming: 0,
      targetType: 'private',
    },
    isVideo.value ? CALL_CONFIG.videoWindowSize : undefined
  );
};
</script>

<style scoped lang="scss">
.call-bubble {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  cursor: pointer;
  user-select: none;

  .call-icon {
    opacity: 0.7;
  }

  .text {
    font-size: 14px;
  }

  &.missed .call-icon,
  &.missed .text {
    color: var(--el-color-danger, #f56c6c);
    opacity: 1;
  }
}
</style>
