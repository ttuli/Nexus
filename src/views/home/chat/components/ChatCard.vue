<template>
    <div class="chat-card" :class="{ active: props.isActive, 'is-top': props.data.is_top === 2 }"
        @click.capture.stop="handleClick">
        <div class="avatar-container">
            <Avatar :uid="getTargetId(props.data)"
                :type="props.data.type === ImTypes.ConversationType.CONVERSATION_TYPE_GROUP ? 'group' : 'user'" />
        </div>
        <div class="content-container">
            <div class="top-row">
                <span class="name">{{ displayName }}</span>
                <span class="time" v-if="props.data.last_content">{{ formatTime(props.data.last_message_time)
                    }}</span>
            </div>
            <div class="bottom-row">
                <span class="message">{{ props.data.last_content || '' }}</span>
                <div class="badge" :class="{ 'disturb-badge': props.data.is_disturb === 2 }" v-if="props.data.unread_count > 0">{{ props.data.unread_count }}</div>
                <span class="disturb-icon" v-else-if="props.data.is_disturb === 2 && props.data.unread_count === 0" v-html="notdisturb"></span>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ImTypes } from '@/types';
import { useUserStore } from '@/store/user';
import { useGroupStore } from '@/store/group';
import { extractTargetIdFromSessionId } from '@/utils/chat';

import notdisturb from '@/assets/chat/notdisturb.svg?raw';

// Props
interface Props {
    data: ImTypes.Conversation;
    isActive?: boolean;
}
const props = defineProps<Props>();

const userStore = useUserStore();
const groupStore = useGroupStore();

const getTargetId = (chat: ImTypes.Conversation) => {
    return extractTargetIdFromSessionId(chat.conversation_id, userStore.getUserID());
}

// 动态获取名称
const displayName = computed(() => {
    const targetId = getTargetId(props.data);
    if (!targetId) return '';

    if (props.data.type === ImTypes.ConversationType.CONVERSATION_TYPE_PRIVATE) {
        const user = userStore.getUser(targetId);
        const friend = userStore.getFriend(targetId);
        return friend?.remark || user?.user_name || `用户${targetId}`;
    } else {
        const group = groupStore.getGroup(targetId);
        return group?.name || `群组${targetId}`;
    }
});

// Emits
const emit = defineEmits<{
    (e: 'click', sessionId: string): void;
}>();

const handleClick = () => {
    emit('click', props.data.conversation_id);
};

// Utils
const formatTime = (timestamp: number | null) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();

    const isSameDay = (d1: Date, d2: Date) =>
        d1.getFullYear() === d2.getFullYear() &&
        d1.getMonth() === d2.getMonth() &&
        d1.getDate() === d2.getDate();

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);

    if (isSameDay(date, now)) {
        return date.getHours().toString().padStart(2, '0') + ':' + date.getMinutes().toString().padStart(2, '0');
    } else if (isSameDay(date, yesterday)) {
        return '昨天';
    } else {
        return (date.getMonth() + 1).toString().padStart(2, '0') + '-' + date.getDate().toString().padStart(2, '0');
    }
};
</script>

<style scoped lang="scss">
@use "@/style/_constant.scss" as *;

.chat-card {
    display: flex;
    align-items: center;
    padding: 12px 16px;
    background-color: transparent; // Parent handles bg
    cursor: pointer;
    transition: background-color 0.2s;
    height: 72px; // Fixed height for consistency
    box-sizing: border-box;

    &.is-top {
        background-color: $bg-body;
    }

    &:hover {
        background-color: $bg-hover;
    }

    &.active {
        background-color: $bg-active;
    }

    .avatar-container {
        margin-right: 12px;
        flex-shrink: 0;
        pointer-events: none;
    }

    .content-container {
        flex: 1;
        min-width: 0; // flex child truncation fix
        display: flex;
        flex-direction: column;
        justify-content: center;
        height: 100%;

        .top-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 4px;

            .name {
                font-size: 16px;
                font-weight: 500;
                color: $color-text-primary;
                @include ellipsis;
            }

            .time {
                font-size: 12px;
                color: $color-text-placeholder;
                flex-shrink: 0;
                margin-left: 8px;
            }
        }

        .bottom-row {
            display: flex;
            justify-content: space-between;
            align-items: center;

            .message {
                font-size: 14px;
                color: $color-text-secondary;
                @include ellipsis;
                flex: 1;
                margin-right: 8px;
            }

            .badge {
                min-width: 18px;
                height: 18px;
                border-radius: 9px;
                background-color: $color-error;
                color: white;
                font-size: 10px;
                line-height: 18px;
                text-align: center;
                padding: 0 5px;
                box-sizing: border-box;
                flex-shrink: 0;

                &.disturb-badge {
                    background-color: #c0c4cc;
                }
            }

            .disturb-icon {
                width: 14px;
                height: 14px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: $color-text-placeholder;
                flex-shrink: 0;

                :deep(svg) {
                    width: 100%;
                    height: 100%;
                }
            }
        }
    }
}
</style>
