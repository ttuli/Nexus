<template>
  <div
    class="call-bubble"
    :class="{
      'is-self': isSelf,
      'is-missed': isMissed,
      'is-video': isVideo,
    }"
    @click="redial"
    :title="redialTitle"
  >
    <!-- 左侧状态图标徽章 -->
    <div class="call-badge">
      <component :is="badgeIcon" class="app-icon app-icon--md badge-icon" />
    </div>

    <!-- 通话类型与状态信息 -->
    <div class="call-content">
      <div class="call-title">{{ callTitle }}</div>
      <div class="call-desc">{{ statusDesc }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { CallIncoming, CallOutgoing, CallSlash, Video } from 'reicon-vue';
import { ImTypes } from '@shared/types';
import type { ILocalCallMessage } from '@shared/types';
import { formatCallDuration } from '@/src/utils/messageConverter';
import { useUserStore } from '@/src/store/user';
import { useSessionStore } from '@/src/store/session';
import { windowService } from '@/src/services';
import { WindowKey } from '@shared/config/windowKeys';
import { extractTargetIdFromSessionId } from '@/src/utils/sessionUtils';

interface Props {
  message: ILocalCallMessage;
  isSelf?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  isSelf: false,
});

const userStore = useUserStore();
const sessionStore = useSessionStore();

const isSelf = computed(() => {
  return props.isSelf || props.message.fromUserId === userStore.getUserID();
});

const isVideo = computed(
  () => props.message.mediaType === ImTypes.CallMediaType.CALL_MEDIA_TYPE_VIDEO
);

/** 未接听 / 未接通（仅在被叫侧标红警示） */
const isMissed = computed(() => {
  if (isSelf.value) return false;
  return [
    ImTypes.CallEndReason.CALL_END_REASON_CANCELED,
    ImTypes.CallEndReason.CALL_END_REASON_MISSED,
    ImTypes.CallEndReason.CALL_END_REASON_PEER_OFFLINE,
    ImTypes.CallEndReason.CALL_END_REASON_BUSY,
    ImTypes.CallEndReason.CALL_END_REASON_REJECTED,
  ].includes(props.message.endReason);
});

const callTitle = computed(() => (isVideo.value ? '视频通话' : '语音通话'));

const statusDesc = computed(() => {
  const iAmCaller = isSelf.value;
  switch (props.message.endReason) {
    case ImTypes.CallEndReason.CALL_END_REASON_COMPLETED:
      return `通话时长 ${formatCallDuration(props.message.duration || 0)}`;
    case ImTypes.CallEndReason.CALL_END_REASON_CANCELED:
      return iAmCaller ? '通话已取消' : '未接来电';
    case ImTypes.CallEndReason.CALL_END_REASON_REJECTED:
      return iAmCaller ? '对方已拒绝' : '已拒绝接听';
    case ImTypes.CallEndReason.CALL_END_REASON_MISSED:
      return iAmCaller ? '对方无应答' : '未接来电';
    case ImTypes.CallEndReason.CALL_END_REASON_PEER_OFFLINE:
      return iAmCaller ? '对方不在线' : '未接来电';
    case ImTypes.CallEndReason.CALL_END_REASON_BUSY:
      return iAmCaller ? '对方忙线' : '未接来电';
    default:
      return '通话未接通';
  }
});

const badgeIcon = computed(() => {
  if (isVideo.value) return Video;
  if (isMissed.value) return CallSlash;
  if (isSelf.value) return CallOutgoing;
  return CallIncoming;
});

const redialTitle = computed(() => (isSelf.value ? '再次拨打语音通话' : '回拨语音通话'));

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
@use "@/src/style/_constant.scss" as *;

.call-bubble {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  min-width: 140px;
  max-width: 220px;
  box-sizing: border-box;
  cursor: pointer;
  user-select: none;
  border-radius: 12px;
  border-top-left-radius: 3px;
  background: var(--surface-default, #ffffff);
  border: 1px solid var(--border-color, #e2e8f0);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);

  &:hover {
    border-color: rgba(24, 144, 255, 0.4);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
    transform: translateY(-1px);

    .call-badge {
      transform: scale(1.05);
    }
  }

  /* 状态图标徽章 */
  .call-badge {
    width: 34px;
    height: 34px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    background: var(--color-primary-bg, #f0f7ff);
    color: var(--color-primary, #1890ff);
    transition: all 0.2s ease;
  }

  /* 文案信息区域 */
  .call-content {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 2px;
    flex: 1;
    min-width: 0;

    .call-title {
      font-size: 13px;
      font-weight: 500;
      line-height: 1.35;
      color: var(--text-primary, #1e293b);
      @include ellipsis;
    }

    .call-desc {
      font-size: 11.5px;
      line-height: 1.3;
      color: var(--text-secondary, #64748b);
      @include ellipsis;
    }
  }

  /* 未接听 / 标红异常状态（被叫方未通） */
  &.is-missed {
    border-color: rgba(245, 108, 108, 0.25);

    .call-badge {
      background: rgba(245, 108, 108, 0.1);
      color: var(--el-color-danger, #f56c6c);
    }

    .call-desc {
      color: var(--el-color-danger, #f56c6c);
      font-weight: 500;
    }

    &:hover {
      border-color: rgba(245, 108, 108, 0.5);
      box-shadow: 0 4px 14px rgba(245, 108, 108, 0.12);
    }
  }

  /* 发送方（自己）气泡：主色主题渐变 */
  &.is-self {
    border-top-left-radius: 12px;
    border-top-right-radius: 3px;
    background: linear-gradient(135deg, var(--color-primary-light, #40a9ff) 0%, var(--color-primary, #1890ff) 100%);
    border-color: transparent;
    box-shadow: 0 2px 8px rgba(24, 144, 255, 0.24);

    .call-badge {
      background: rgba(255, 255, 255, 0.2);
      color: #ffffff;
    }

    .call-title {
      color: #ffffff;
    }

    .call-desc {
      color: rgba(255, 255, 255, 0.85);
    }

    &:hover {
      border-color: transparent;
      box-shadow: 0 4px 14px rgba(24, 144, 255, 0.38);

      .call-badge {
        background: rgba(255, 255, 255, 0.28);
      }
    }
  }

  /* 暗色模式适配 */
  [data-theme='dark'] & {
    background: var(--surface-default, #1e293b);
    border-color: var(--border-color, #334155);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);

    .call-badge {
      background: rgba(24, 144, 255, 0.16);
      color: var(--color-primary-light, #40a9ff);
    }

    .call-title {
      color: var(--text-primary, #f8fafc);
    }

    .call-desc {
      color: var(--text-secondary, #94a3b8);
    }

    &:hover {
      border-color: var(--color-primary, #177ddc);
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    }

    &.is-missed {
      border-color: rgba(245, 108, 108, 0.3);

      .call-badge {
        background: rgba(245, 108, 108, 0.18);
        color: #ff7875;
      }

      .call-desc {
        color: #ff7875;
      }

      &:hover {
        border-color: rgba(245, 108, 108, 0.5);
        box-shadow: 0 4px 16px rgba(245, 108, 108, 0.18);
      }
    }

    &.is-self {
      background: linear-gradient(135deg, var(--color-primary-light, #3c9ae8) 0%, var(--color-primary, #177ddc) 100%);
      border-color: transparent;

      .call-title {
        color: #ffffff;
      }

      .call-desc {
        color: rgba(255, 255, 255, 0.85);
      }

      .call-badge {
        background: rgba(255, 255, 255, 0.2);
        color: #ffffff;
      }

      &:hover {
        box-shadow: 0 4px 16px rgba(23, 125, 220, 0.45);

        .call-badge {
          background: rgba(255, 255, 255, 0.28);
        }
      }
    }
  }
}
</style>
