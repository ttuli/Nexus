<template>
    <div class="user-card" :class="{ 'is-me': isMe }">
        <div class="user-info">
            <div class="avatar-wrapper">
                <Avatar :uid="userInfo.user_id" type="user" :width="'48px'" :height="'48px'" />
            </div>
            <div class="info-content">
                <div class="name-row">
                    <span class="name" v-html="highlightKeyword(userInfo.user_name || '未命名')"></span>
                    <img :src="maleIcon" class="gender-icon" v-if="userInfo.gender === ImTypes.Gender.GENDER_MALE" />
                    <img :src="femaleIcon" class="gender-icon"
                        v-else-if="userInfo.gender === ImTypes.Gender.GENDER_FEMALE" />
                    <span v-if="isMe" class="me-tag">我</span>
                </div>
                <div class="sub-info">
                    <span class="label">账号:</span>
                    <span class="value" v-html="highlightKeyword(userInfo.user_id.toString())"></span>
                </div>
                <div class="sub-info" v-if="userInfo.phone">
                    <span class="label">手机:</span>
                    <span class="value" v-html="highlightKeyword(userInfo.phone)"></span>
                </div>
            </div>
        </div>

        <div class="action-area">
            <template v-if="isMe">
                <!-- Self: No action needed or maybe 'Edit Profile' but usually nothing in search -->
            </template>
            <template v-else-if="status === 'added'">
                <button class="status-btn success" disabled>
                    已添加
                </button>
            </template>
            <template v-else-if="status === 'applying'">
                <button class="status-btn warning" disabled>
                    等待验证
                </button>
            </template>
            <template v-else>
                <button class="action-btn" @click="$emit('add', userInfo)">
                    添加好友
                </button>
            </template>
        </div>
    </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { ImTypes } from '@shared/types';
import { useUserStore } from '@/src/store/user';
import Avatar from '@/src/components/Avatar.vue';
import maleIcon from '@/src/assets/gender/male.svg?url';
import femaleIcon from '@/src/assets/gender/female.svg?url';


const props = defineProps<{
    userInfo: ImTypes.UserInfo;
    keyword?: string;
}>();

defineEmits<{
    (e: 'add', user: ImTypes.UserInfo): void;
}>();

const userStore = useUserStore();
const isMe = computed(() => userStore.userID === props.userInfo.user_id);

const status = computed(() => {
    if (userStore.isFriend(props.userInfo.user_id)) {
        return 'added';
    }
    if (userStore.isFriendRequest(props.userInfo.user_id)) {
        return 'applying';
    }
    return 'none';
});

const highlightKeyword = (text: string) => {
    if (!props.keyword || !text) return text;
    // Simple regex replace, careful with special chars in keyword
    try {
        const reg = new RegExp(`(${props.keyword})`, 'gi');
        return text.replace(reg, '<span class="highlight">$1</span>');
    } catch (e) {
        return text;
    }
};
</script>

<style lang="scss" scoped>
@use "@/src/style/_constant.scss" as *;

.user-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: $spacing-md $spacing-lg;
    background-color: $bg-card;
    border-radius: 12px;
    margin-bottom: $spacing-md;
    transition: all $transition-base;
    border: 1px solid transparent;

    // Glassmorphism effect preparation (if needed by parent bg)
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);

    &:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
        border-color: color-mix(in srgb, var(--color-primary) 10%, transparent);
    }

    &.is-me {
        background-color: color-mix(in srgb, var(--color-primary) 2%, transparent);
        border-color: color-mix(in srgb, var(--color-primary) 5%, transparent);
    }

    .user-info {
        display: flex;
        align-items: center;
        gap: $spacing-md;
        flex: 1;
        min-width: 0; // For text ellipsis

        .avatar-wrapper {
            position: relative;

            .avatar {
                width: 48px;
                height: 48px;
                border-radius: 50%;
                object-fit: cover;
                border: 2px solid $bg-card;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            }
        }

        .info-content {
            display: flex;
            flex-direction: column;
            gap: 2px;
            overflow: hidden;

            .name-row {
                display: flex;
                align-items: center;
                gap: 8px;

                .gender-icon {
                    width: 14px;
                    height: 14px;
                }

                .name {
                    font-size: $font-size-lg;
                    font-weight: $font-weight-medium;
                    color: $color-text-primary;
                    @include ellipsis;

                    :deep(.highlight) {
                        color: $color-primary;
                        font-weight: bold;
                    }
                }

                .me-tag {
                    font-size: 10px;
                    background-color: $color-primary;
                    color: white;
                    padding: 0 4px;
                    border-radius: 4px;
                    height: 16px;
                    line-height: 16px;
                }
            }

            .sub-info {
                font-size: $font-size-sm;
                color: $color-text-secondary;
                display: flex;
                align-items: center;
                gap: 4px;

                .value {
                    @include ellipsis;

                    :deep(.highlight) {
                        color: $color-primary;
                    }
                }
            }
        }
    }

    .action-area {
        margin-left: $spacing-md;
        flex-shrink: 0;

        .action-btn {
            background-color: $color-primary;
            color: white;
            border: none;
            padding: 6px 16px;
            border-radius: 6px;
            font-size: $font-size-sm;
            cursor: pointer;
            transition: all $transition-base;
            font-weight: $font-weight-medium;

            &:hover {
                filter: brightness(1.1);
                transform: translateY(-1px);
                box-shadow: 0 2px 4px color-mix(in srgb, var(--color-primary) 30%, transparent);
            }

            &:active {
                transform: translateY(0);
            }
        }

        .status-btn {
            background: none;
            border: none;
            font-size: $font-size-sm;
            cursor: default;
            padding: 6px 12px;

            &.success {
                color: $color-success;
            }

            &.warning {
                color: $color-warning;
            }
        }
    }
}
</style>
