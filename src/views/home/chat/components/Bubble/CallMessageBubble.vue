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

const redialTitle = '重拨语音通话';

/**
 * 回拨：恒为语音。
 * 视频通话已下线，历史记录里的视频通话（气泡图标仍如实显示为视频）也只能回拨语音。
 */
const redial = () => {
  const sessionKey = props.message.sessionKey || sessionStore.currentSessionKey;
  const peerId = extractTargetIdFromSessionId(sessionKey, userStore.getUserID());
  if (!peerId) return;

  windowService.createWindow(
    WindowKey.Call,
    {
      peerId,
      sessionKey,
      mediaType: ImTypes.CallMediaType.CALL_MEDIA_TYPE_AUDIO,
      isIncoming: 0,
      targetType: 'private',
    },
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
