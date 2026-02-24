<template>
    <div class="group-card" :class="{ 'is-joined': isJoined }">
        <div class="group-info">
            <Avatar :uid="groupInfo.id" type="group" :width="'48px'" :height="'48px'" />
            <div class="info-content">
                <div class="name-row">
                    <span class="name" v-html="highlightKeyword(groupInfo.name || '未命名群组')"></span>
                </div>
                <div class="sub-info">
                    <span class="label">群号:</span>
                    <span class="value" v-html="highlightKeyword(groupInfo.id.toString())"></span>
                </div>
                <div class="sub-info">
                    <span class="label">成员:</span>
                    <span class="value">{{ groupInfo.member_count }}人</span>
                </div>
            </div>
        </div>

        <div class="action-area">
            <template v-if="isJoined">
                <button class="status-btn success" disabled>
                    已加入
                </button>
            </template>
            <template v-else>
                <button class="action-btn" @click="$emit('join', groupInfo)">
                    申请加入
                </button>
            </template>
        </div>
    </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { ImTypes } from '@/types';
import { useGroupStore } from '@/store/group';
import Avatar from '@/components/Avatar.vue';

const props = defineProps<{
    groupInfo: ImTypes.GroupInfo;
    keyword?: string;
}>();

defineEmits<{
    (e: 'join', group: ImTypes.GroupInfo): void;
}>();

const groupStore = useGroupStore();
const isJoined = computed(() => groupStore.isJoinedGroup(props.groupInfo.id));

const highlightKeyword = (text: string) => {
    if (!props.keyword || !text) return text;
    try {
        const reg = new RegExp(`(${props.keyword})`, 'gi');
        return text.replace(reg, '<span class="highlight">$1</span>');
    } catch (e) {
        return text;
    }
    return text
};
</script>

<style lang="scss" scoped>
@use "@/style/_constant.scss" as *;

.group-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: $spacing-md $spacing-lg;
    background-color: $bg-card;
    border-radius: 12px;
    margin-bottom: $spacing-md;
    transition: all $transition-base;
    border: 1px solid transparent;

    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);

    &:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
        border-color: color-mix(in srgb, var(--color-primary) 10%, transparent);
    }

    &.is-joined {
        background-color: color-mix(in srgb, var(--color-primary) 2%, transparent);
        border-color: color-mix(in srgb, var(--color-primary) 5%, transparent);
    }

    .group-info {
        display: flex;
        align-items: center;
        gap: $spacing-md;
        flex: 1;
        min-width: 0;

        .info-content {
            display: flex;
            flex-direction: column;
            gap: 2px;
            overflow: hidden;

            .name-row {
                display: flex;
                align-items: center;
                gap: 8px;

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
                font-size: $font-size-base;
                color: $color-success;
            }

            &.warning {
                color: $color-warning;
            }
        }
    }
}
</style>
