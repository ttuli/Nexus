<template>
    <div class="chat-card" :class="{ active: props.isActive, 'is-top': props.data.is_top === 2 }"
        @click.capture.stop="handleClick">
        <div class="avatar-container">
            <Avatar :uid="getTargetId(props.data) || 0"
                :type="props.data.type === ImTypes.SessionType.SESSION_TYPE_GROUP ? 'group' : 'user'" />
        </div>
        <div class="content-container">
            <div class="left-column">
                <span class="name">{{ displayName }}</span>
                <span class="message">{{ displayContent }}</span>
            </div>
            <div class="right-column">
                <span class="time" v-if="props.data.last_content">{{ formatTime(props.data.last_message_time) }}</span>
                <Badge class="session-badge" :class="{ 'disturb-badge': props.data.is_disturb === 2 }"
                    :value="props.data.unread_count" :is-dot="props.data.is_disturb === 2"
                    :hidden="props.data.unread_count === 0" />
                <BellOff class="disturb-icon app-icon app-icon--xs" v-if="props.data.is_disturb === 2 && props.data.unread_count === 0" />
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ImTypes } from '@shared/types';
import { useUserStore } from '@/src/store/user';
import { useGroupStore } from '@/src/store/group';
import { extractTargetIdFromSessionId } from '@/src/utils/sessionUtils';
import { BellOff } from 'reicon-vue';

// Props
interface Props {
    data: ImTypes.Session;
    isActive?: boolean;
}
const props = defineProps<Props>();

// Emits
const emit = defineEmits<{
    (e: 'click', sessionId: string): void;
}>();

const userStore = useUserStore();
const groupStore = useGroupStore();

const getTargetId = (chat: ImTypes.Session) => {
    return extractTargetIdFromSessionId(chat.session_key || '', userStore.getUserID());
}

// 动态获取名称
const displayName = computed(() => {
    const targetId = getTargetId(props.data);
    if (!targetId) return '';

    if (props.data.type === ImTypes.SessionType.SESSION_TYPE_PRIVATE) {
        const user = userStore.getUser(targetId);
        const friend = userStore.getFriend(targetId);
        return friend?.remark || user?.user_name || `用户${targetId}`;
    } else {
        const group = groupStore.getGroup(targetId);
        return group?.name || `群组${targetId}`;
    }
});

const displayContent = computed(() => {
    if (props.data.type === ImTypes.SessionType.SESSION_TYPE_GROUP) {
        const lastContent = props.data.last_content || '';
        // 自己发送的消息不加发送者前缀
        if (props.data.last_sender === userStore.userID) return lastContent;
        // last_sender 为 0（系统消息，摘要已含操作人）或用户信息未缓存时同样不加前缀
        const user = userStore.getUser(props.data.last_sender);
        return user?.user_name ? `${user.user_name}: ${lastContent}` : lastContent;
    }
    return props.data.last_content
})

const handleClick = () => {
    emit('click', props.data.session_key || '');
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
@use "@/src/style/_constant.scss" as *;

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
        flex-direction: row;
        align-items: center;
        height: 100%;

        .left-column {
            flex: 1;
            min-width: 0;
            display: flex;
            flex-direction: column;
            justify-content: center;

            .name {
                font-size: 16px;
                font-weight: 500;
                color: $color-text-primary;
                @include ellipsis;
                line-height: 22px;
                margin-bottom: 4px;
            }

            .message {
                font-size: 14px;
                color: $color-text-secondary;
                @include ellipsis;
                line-height: 20px;
            }
        }

        .right-column {
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            flex-shrink: 0;
            margin-left: 12px;
            height: 46px; // aligns with 22(name) + 4(margin) + 20(message)

            .time {
                font-size: 12px;
                color: $color-text-placeholder;
                line-height: 22px;
            }

            .session-badge {
                margin-top: auto;

                &:only-child {
                    margin-bottom: auto;
                }

                &.disturb-badge {
                    background: #c0c4cc;
                    box-shadow: none;
                }
            }

            .disturb-icon {
                margin-top: auto;
                width: 14px;
                height: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: $color-text-placeholder;

                &:only-child {
                    margin-bottom: auto;
                }

                :deep(svg) {
                    width: 14px;
                    height: 14px;
                }
            }
        }
    }
}
</style>
