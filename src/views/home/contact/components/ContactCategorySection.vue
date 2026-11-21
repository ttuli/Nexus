<template>
    <div class="contact-category">
        <div class="category-header" @click="$emit('toggle')">
            <ArrowRight2 class="arrow app-icon app-icon--xs" :class="{ expanded }" />
            <span class="title">{{ title }}</span>
            <span class="count">{{ count }}</span>
        </div>
        <div class="category-collapse" :class="{ expanded }">
            <div class="category-collapse-inner">
                <div class="category-content">
                    <slot />
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ArrowRight2 } from 'reicon-vue';

defineProps<{
    title: string;
    count: number;
    expanded: boolean;
}>();

defineEmits<{
    (e: 'toggle'): void;
}>();
</script>

<style scoped lang="scss">
.contact-category + .contact-category {
    margin-top: 2px;
}

.category-header {
    display: flex;
    align-items: center;
    padding: 8px 16px;
    cursor: pointer;
    user-select: none;
    font-size: 13px;
    color: $color-text-secondary;
    transition: color 0.15s ease;

    &:hover {
        color: $color-text-primary;

        .arrow {
            color: $color-text-secondary;
        }
    }

    .arrow {
        margin-right: 6px;
        color: $color-text-placeholder;
        transition: transform 0.24s cubic-bezier(0.25, 1, 0.5, 1), color 0.15s ease;

        &.expanded {
            transform: rotate(90deg);
        }
    }

    .title {
        flex: 1;
        font-weight: 500;
    }

    .count {
        font-size: 12px;
        color: $color-text-placeholder;
    }
}

.category-collapse {
    display: grid;
    grid-template-rows: 0fr;
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transition:
        grid-template-rows 0.24s cubic-bezier(0.25, 1, 0.5, 1),
        opacity 0.2s ease,
        visibility 0s linear 0.24s;

    &.expanded {
        grid-template-rows: 1fr;
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
        transition:
            grid-template-rows 0.24s cubic-bezier(0.25, 1, 0.5, 1),
            opacity 0.2s ease,
            visibility 0s linear 0s;
    }
}

.category-collapse-inner {
    min-height: 0;
    overflow: hidden;
}

.category-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 0 8px;
}
</style>
