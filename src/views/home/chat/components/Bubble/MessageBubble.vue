<template>
    <div class="message-bubble" :class="{ 'is-self': isSelf, 'is-recalling': recalling }">
        <div class="avatar-wrapper">
            <Avatar :uid="message.fromUserId" type="user" />
        </div>

        <div class="content-wrapper">
            <div class="header" v-if="!isSelf">
                <span class="name">{{ senderName }}</span>
            </div>

            <!-- New wrapper for bubble and status -->
            <div class="bubble-row" :class="{ 'is-self': isSelf }">
                <div class="bubble" :class="{ 'is-image': isImageMessage, 'is-video': isVideoMessage, 'is-file': isFileMessage, 'is-call': isCallMessage, 'is-recalling': recalling }"
                    @contextmenu.prevent="handleContextMenu">
                    <!-- Image Messages -->
                    <ImageMessageBubble v-if="isImageMessage" :message="(message as ILocalImageMessage)" />

                    <!-- Video Messages -->
                    <VideoMessageBubble v-else-if="isVideoMessage" :message="(message as ILocalVideoMessage)" />

                    <!-- File Messages -->
                    <FileMessageBubble v-else-if="isFileMessage" :message="(message as ILocalFileMessage)"
                        :isSelf="isSelf" />

                    <!-- 通话记录 -->
                    <CallMessageBubble v-else-if="isCallMessage" :message="(message as ILocalCallMessage)"
                        :isSelf="isSelf" />

                    <!-- Text & Fallback Messages -->
                    <div class="text" v-else>{{ messageContent }}</div>
                </div>

                <!-- Status & Recalling Indicators -->
                <div class="recalling-indicator" v-if="recalling">
                    <span class="recalling-text">撤回中...</span>
                </div>
                <div class="status-indicator loading"
                    v-else-if="isSelf && (message.status === MessageStatus.MESSAGE_STATUS_SENDING ||
                     message.status === MessageStatus.MESSAGE_STATUS_SENT)"></div>
                <div class="status-indicator failed"
                    v-else-if="isSelf && message.status === MessageStatus.MESSAGE_STATUS_FAILED"
                    title="点击重新发送"
                    @click.stop="emit('resend', message)">!</div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useUserStore } from '@/src/store/user';
import { useChatPage } from '@/src/composables/useChatPage';
import ImageMessageBubble from './ImageMessageBubble.vue';
import FileMessageBubble from './FileMessageBubble.vue';
import CallMessageBubble from './CallMessageBubble.vue';
import VideoMessageBubble from './VideoMessageBubble.vue';

// Replace MessageItem definition with IChatMessage import
import { IChatMessage, ILocalTextMessage, ILocalFileMessage, ILocalImageMessage, ILocalVideoMessage, ILocalCallMessage } from '@shared/types/chatMessage';
import { ImTypes } from '@shared/types';

// Rename MessageType/Status to avoid conflict if needed, or just use types.MessageType
const MessageType = ImTypes.MessageType;
const MessageStatus = ImTypes.MessageStatus;

interface Props {
    message: IChatMessage;
    isSelf: boolean;
}

const props = defineProps<Props>();
const userStore = useUserStore();
const { isRecalling } = useChatPage();

const recalling = computed(() => isRecalling(props.message.msgId));

const senderName = computed(() =>
    userStore.getDisplayName(props.message.fromUserId) || `用户${props.message.fromUserId}`
);

const isImageMessage = computed(() => {
    return props.message.type === MessageType.CHAT_IMAGE || props.message.type === MessageType.GROUP_IMAGE;
});

const isVideoMessage = computed(() => {
    return props.message.type === MessageType.CHAT_VIDEO || props.message.type === MessageType.GROUP_VIDEO;
});

const isFileMessage = computed(() => {
    return props.message.type === MessageType.CHAT_FILE || props.message.type === MessageType.GROUP_FILE;
});

const isCallMessage = computed(() => props.message.type === MessageType.CHAT_CALL);

// Helper to get message content based on type (for text & fallback messages)
const messageContent = computed(() => {
    switch (props.message.type) {
        case MessageType.CHAT_TEXT:
        case MessageType.GROUP_TEXT:
            return (props.message as ILocalTextMessage).content;
        default:
            return '[未知消息]';
    }
});

const emit = defineEmits<{
    (e: 'contextmenu', event: MouseEvent, message: IChatMessage): void;
    (e: 'resend', message: IChatMessage): void;
}>();

const handleContextMenu = (event: MouseEvent) => {
    emit('contextmenu', event, props.message);
};

</script>

<style scoped lang="scss">
.message-bubble {
    display: flex;
    margin-bottom: 20px;
    padding: 0 16px;
    width: 100%;
    box-sizing: border-box;

    &.is-recalling {
        pointer-events: none;
        user-select: none;

        .bubble {
            animation: messageRecallingPulse 1.2s ease-in-out infinite;
        }
    }

    &.is-self {
        flex-direction: row-reverse;

        .avatar-wrapper {
            margin-right: 0;
            margin-left: 12px;
        }

        .content-wrapper {
            align-items: flex-end;

            .bubble {
                background-color: $color-primary;
                color: white;
                border-top-left-radius: 12px;
                border-top-right-radius: 2px;
                border-bottom-right-radius: 12px;
                border-bottom-left-radius: 12px;
            }
        }
    }

    .avatar-wrapper {
        flex-shrink: 0;
        margin-right: 12px;
        margin-top: 2px; // Align with top of bubble or name

        // 头像尺寸在这里写死（与 Avatar 默认的 40px 一致）：Avatar 的宽高靠 CSS v-bind，挂载后才生效，
        // 虚拟列表在挂载那一刻测行高，默认头像图还是原图尺寸，整行会被量成近千像素。
        // 行很快滚出视口被卸载的话，错误高度留在缓存里，跳转定位（scrollToIndex）会落到别处
        :deep(.avatar) {
            width: 40px;
            height: 40px;
        }
    }

    .content-wrapper {
        display: flex;
        flex-direction: column;
        max-width: 70%;
        align-items: flex-start;

        .header {
            display: flex;
            align-items: baseline;
            margin-bottom: 4px;

            .name {
                font-size: 12px;
                color: $color-text-secondary;
            }
        }

        .bubble-row {
            display: flex;
            align-items: flex-end;
            gap: 8px;
            /* Space between status and bubble */

            /* Reverse order for self messages so status is on the left */
            &.is-self {
                flex-direction: row-reverse;
            }
        }

        .recalling-indicator {
            display: flex;
            align-items: center;
            height: 20px;
            user-select: none;
            padding: 0 2px;

            .recalling-text {
                font-size: 11px;
                font-weight: 500;
                line-height: 1;
                white-space: nowrap;
                color: #94a3b8;
                background: linear-gradient(
                    90deg,
                    #94a3b8 0%,
                    #94a3b8 35%,
                    #ffffff 50%,
                    #94a3b8 65%,
                    #94a3b8 100%
                );
                background-size: 200% 100%;
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
                animation: recallingTextPulse 1.6s linear infinite;
            }
        }

        .status-indicator {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 20px;
            height: 20px;

            &.loading {
                border: 2px solid $color-border;
                border-top: 2px solid $color-primary;
                border-radius: 50%;
                width: 14px;
                height: 14px;
                animation: spin 1s linear infinite;
            }

            &.failed {
                background-color: $color-error;
                color: white;
                border-radius: 50%;
                width: 16px;
                height: 16px;
                font-size: 11px;
                font-weight: bold;
                line-height: 16px;
                cursor: pointer;
            }
        }

        .bubble {
            padding: 10px 14px;
            background-color: white;
            border-top-left-radius: 2px;
            border-top-right-radius: 12px;
            border-bottom-right-radius: 12px;
            border-bottom-left-radius: 12px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
            position: relative;
            word-break: break-all;
            line-height: 1.5;
            font-size: 14px;
            color: $color-text-primary;
            transition: all 0.2s;

            &.is-image,
            &.is-video,
            &.is-file,
            &.is-call {
                padding: 0; // 图片、视频、文件或通话气泡不需要外层 padding
                background-color: transparent !important; // 不需要外层背景色
                box-shadow: none !important; // 阴影移交到内层
            }

            &:hover {
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);

                &:not(.is-image):not(.is-video):not(.is-file):not(.is-call) {
                    filter: brightness(0.93);
                }
            }
        }
    }
}

@keyframes spin {
    0% {
        transform: rotate(0deg);
    }

    100% {
        transform: rotate(360deg);
    }
}

@keyframes messageRecallingPulse {
    0% {
        opacity: 1;
        transform: scale(1);
    }

    50% {
        opacity: 0.45;
        transform: scale(0.98);
        filter: blur(0.6px);
    }

    100% {
        opacity: 1;
        transform: scale(1);
    }
}

@keyframes recallingTextPulse {
    0% {
        background-position: 200% 0;
    }

    100% {
        background-position: -200% 0;
    }
}
</style>
