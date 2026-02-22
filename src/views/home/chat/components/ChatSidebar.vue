<template>
    <div class="chat-sidebar" :class="{ 'visible': visible }">
        <div class="sidebar-header">
            <span>{{ title }}</span>
            <div class="close-btn" @click="$emit('close')">
                <i class="icon-close">×</i>
            </div>
        </div>
        <div class="sidebar-content scroll-bar-thin">
            <template v-if="chat">
                <div class="info-section">
                    <div class="avatar-wrapper">
                        <span class="text-xs text-gray-400 bg-gray-100 dark:bg-gray-700 px-1 rounded">
                            {{ chat.type === ImTypes.ConversationType.CONVERSATION_TYPE_PRIVATE ? 'User' : 'ImTypes.GroupInfo' }}
                        </span>
                    </div>
                    <div class="name">{{ name }}</div>
                    <div class="id">ID: {{ chat.target_id }}</div>
                </div>
                <!-- Placeholder for more info -->
                <div class="detail-group">
                    <div class="detail-item">
                        <span class="label">备注</span>
                        <span class="value">暂无备注</span>
                    </div>
                    <div class="detail-item" v-if="chat.type === ImTypes.ConversationType.CONVERSATION_TYPE_GROUP">
                        <span class="label">群公告</span>
                        <span class="value">暂无公告</span>
                    </div>
                </div>
            </template>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useUserStore } from '@/store/user';
import { useGroupStore } from '@/store/group';
import { ImTypes } from '@/types';

const props = defineProps<{
    visible: boolean;
    chat: ImTypes.Conversation | null;
}>();

defineEmits(['close']);

const userStore = useUserStore();
const groupStore = useGroupStore();

const title = computed(() => {
    return props.chat?.type === ImTypes.ConversationType.CONVERSATION_TYPE_PRIVATE ? '好友信息' : '群组信息';
});

const name = computed(() => {
    if (!props.chat || !props.chat.target_id) return '';
    const targetId = props.chat.target_id;
    // Get friend/group info if needed
    if (props.chat.type === ImTypes.ConversationType.CONVERSATION_TYPE_PRIVATE) {
        const friend = userStore.getFriend(props.chat.target_id);
        const user = userStore.getUser(targetId);
        return friend?.remark || user?.user_name || `用户${targetId}`;
    } else {
        const group = groupStore.getGroup(targetId);
        return group?.name || `群组${targetId}`;
    }
});
</script>

<style scoped lang="scss">
@use "@/style/constant.scss" as *;

.chat-sidebar {
    position: absolute;
    top: 0; // Relative to content-wrapper
    right: 0;
    bottom: 0;
    width: 280px;
    background: #fff;
    border-left: 1px solid $color-border;
    display: flex;
    flex-direction: column;
    z-index: 100;

    // Animation
    transform: translateX(100%);
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);

    &.visible {
        transform: translateX(0);
        box-shadow: -5px 0 15px rgba(0, 0, 0, 0.05);
    }

    .sidebar-header {
        height: 50px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 20px;
        border-bottom: 1px solid $color-border;
        font-weight: 600;
        font-size: 16px;
        color: $color-text-primary;

        .close-btn {
            cursor: pointer;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 4px;
            color: $color-text-secondary;
            transition: all 0.2s;

            &:hover {
                background-color: $bg-hover;
                color: $color-text-primary;
            }

            .icon-close {
                font-style: normal;
                font-size: 18px;
                line-height: 1;
            }
        }
    }

    .sidebar-content {
        flex: 1;
        overflow-y: auto;
        padding: 20px;

        .info-section {
            display: flex;
            flex-direction: column;
            align-items: center;
            margin-bottom: 30px;

            .avatar-wrapper {
                margin-bottom: 15px;

                .avatar-placeholder {
                    width: 80px;
                    height: 80px;
                    background: #f0f2f5;
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 14px;
                    color: $color-text-secondary;
                    border: 1px solid $color-border;
                }
            }

            .name {
                font-size: 18px;
                font-weight: 600;
                color: $color-text-primary;
                margin-bottom: 5px;
                text-align: center;
            }

            .id {
                font-size: 12px;
                color: $color-text-secondary;
            }
        }

        .detail-group {
            background-color: #f9fafb;
            border-radius: 8px;
            padding: 10px;

            .detail-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px 10px;
                font-size: 14px;
                border-bottom: 1px solid rgba($color-border, 0.5);

                &:last-child {
                    border-bottom: none;
                }

                .label {
                    color: $color-text-secondary;
                    flex-shrink: 0;
                    margin-right: 15px;
                }

                .value {
                    color: $color-text-primary;
                    text-align: right;
                    @include ellipsis;
                }
            }
        }
    }
}
</style>
