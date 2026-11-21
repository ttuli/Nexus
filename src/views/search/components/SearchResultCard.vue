<template>
    <div class="search-result-card" :class="{ highlighted }">
        <div class="card-info">
            <div class="avatar-wrapper">
                <Avatar :uid="uid" :type="avatarType" width="48px" height="48px" />
            </div>
            <div class="info-content">
                <div class="name-row">
                    <span class="name">
                        <HighlightText :text="name" :keyword="keyword" />
                    </span>
                    <slot name="name-extra" />
                </div>
                <slot name="details" />
            </div>
        </div>
        <div class="action-area">
            <slot name="action" />
        </div>
    </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
    uid: number;
    avatarType?: 'user' | 'group';
    name: string;
    keyword?: string;
    highlighted?: boolean;
}>(), {
    avatarType: 'user',
    highlighted: false,
});
</script>

<style lang="scss" scoped>
.search-result-card {
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

    &.highlighted {
        background-color: color-mix(in srgb, var(--color-primary) 2%, transparent);
        border-color: color-mix(in srgb, var(--color-primary) 5%, transparent);
    }

    .card-info {
        display: flex;
        align-items: center;
        gap: $spacing-md;
        flex: 1;
        min-width: 0;

        .avatar-wrapper {
            position: relative;
            flex-shrink: 0;

            .avatar {
                width: 48px;
                height: 48px;
                border-radius: 50%;
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

                .name {
                    font-size: $font-size-lg;
                    font-weight: $font-weight-medium;
                    color: $color-text-primary;
                    @include ellipsis;

                    :deep(.hit) {
                        font-weight: bold;
                    }
                }
            }

            :deep(.sub-info) {
                font-size: $font-size-sm;
                color: $color-text-secondary;
                display: flex;
                align-items: center;
                gap: 4px;

                .value {
                    @include ellipsis;
                }
            }
        }
    }

    .action-area {
        margin-left: $spacing-md;
        flex-shrink: 0;

        :deep(.action-btn) {
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

        :deep(.status-btn) {
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
