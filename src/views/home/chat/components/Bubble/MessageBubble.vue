<template>
    <div class="message-bubble" :class="{ 'is-self': isSelf, 'is-recalling': recalling }">
        <div class="avatar-wrapper">
            <Avatar :uid="message.fromUserId" type="user" :size="36" />
        </div>

        <div class="content-wrapper">
            <div class="header" v-if="!isSelf">
                <span class="name">{{ senderName }}</span>
                <span class="time">{{ formatTime(message.sendTime) }}</span>
            </div>

            <!-- New wrapper for bubble and status -->
            <div class="bubble-row" :class="{ 'is-self': isSelf }">
                <div class="bubble" :class="{ 'is-image': isImageMessage, 'is-video': isVideoMessage, 'is-file': isFileMessage, 'is-recalling': recalling }"
                    @contextmenu.prevent="handleContextMenu">
                    <!-- Image Messages -->
                    <ImageMessageBubble v-if="isImageMessage" :message="(message as ILocalImageMessage)" />

                    <!-- Video Messages -->
                    <VideoMessageBubble v-else-if="isVideoMessage" :message="(message as ILocalVideoMessage)" />

                    <!-- File Messages -->
                    <FileMessageBubble v-else-if="isFileMessage" :message="(message as ILocalFileMessage)"
                        :isSelf="isSelf" />

                    <!-- 通话记录 -->
                    <CallMessageBubble v-else-if="isCallMessage" :message="(message as ILocalCallMessage)" />

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
                    v-else-if="isSelf && message.status === MessageStatus.MESSAGE_STATUS_FAILED">!</div>
            </div>

            <div class="footer" v-if="isSelf">
                <span class="time">{{ formatTime(message.sendTime) }}</span>
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

const senderName = computed(() => {
    if (props.isSelf) return '我';
    const friend = userStore.getFriend(props.message.fromUserId);
    const user = userStore.getUser(props.message.fromUserId);
    return friend?.remark || user?.user_name || `用户${props.message.fromUserId}`;
});

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

// Helper to get message content based on type (for non-image, non-file messages)
const messageContent = computed(() => {
    switch (props.message.type) {
        case MessageType.CHAT_TEXT:
        case MessageType.GROUP_TEXT:
            return (props.message as ILocalTextMessage).content;
        case MessageType.CHAT_VIDEO:
        case MessageType.GROUP_VIDEO:
            return '[视频]';
        case MessageType.CHAT_FILE:
        case MessageType.GROUP_FILE:
            return `[文件] ${(props.message as ILocalFileMessage).fileName}`;
        default:
            return '[未知消息]';
    }
});

const emit = defineEmits<{
    (e: 'contextmenu', event: MouseEvent, message: IChatMessage): void;
}>();

const handleContextMenu = (event: MouseEvent) => {
    emit('contextmenu', event, props.message);
};

const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const timeStr = `${hours}:${minutes}`;

    const isToday = 
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth() &&
        date.getDate() === now.getDate();

    if (isToday) {
        return timeStr;
    }

    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');

    if (date.getFullYear() === now.getFullYear()) {
        return `${month}-${day} ${timeStr}`;
    }

    return `${date.getFullYear()}-${month}-${day} ${timeStr}`;
};

</script>

<style scoped lang="scss">
@use "@/src/style/_constant.scss" as *;

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
                margin-right: 8px;
            }

            .time {
                font-size: 10px;
                color: $color-text-placeholder;
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
            &.is-file {
                padding: 0; // 图片、视频或文件气泡不需要外层 padding
                background-color: transparent; // 图片、视频或文件气泡不需要外层背景色
                box-shadow: none; // 阴影移交到内层
            }

            &:hover {
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);

                &:not(.is-image):not(.is-video) {
                    filter: brightness(0.93);
                }
            }
        }

        .footer {
            margin-top: 4px;
            display: flex;
            align-items: center;
            gap: 4px;
            justify-content: flex-end;
            /* Align time to the right for self */

            .time {
                font-size: 10px;
                color: $color-text-placeholder;
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
