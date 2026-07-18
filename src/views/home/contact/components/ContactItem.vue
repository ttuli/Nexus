<template>
    <div class="contact-item" :class="{ active }" @click.capture.stop="handleClick">
        <div class="avatar-wrapper">
            <Avatar :uid="id" :type="type" :width="'40px'" :height="'40px'" class="avatar"/>
            <div v-if="badge" class="badge">{{ badge }}</div>
        </div>
        <div class="info">
            <div class="name">{{ name }}</div>
            <div v-if="desc" class="desc">{{ desc }}</div>
        </div>
    </div>
</template>

<script setup lang="ts">

interface Props {
    id: number;
    type?: 'user' | 'group';
    name: string;
    desc?: string;
    active?: boolean;
    badge?: number | string;
}

withDefaults(defineProps<Props>(), {
    type: 'user',
    active: false,
    badge: 0
});

const emit = defineEmits<{
    (e: 'click'): void;
}>();

const handleClick = () => {
    emit('click');
};
</script>

<style scoped lang="scss">
@use "@/src/style/_constant.scss" as *;

.contact-item {
    display: flex;
    align-items: center;
    padding: 12px;
    gap: 12px;
    cursor: pointer;
    user-select: none;
    background-color: transparent;
    width: 100%;
    box-sizing: border-box;

    &:hover {
        background-color: var(--bg-hover);
    }

    &.active {
        background-color: var(--bg-active);

        .name {
            color: $color-primary;
        }
    }

    .avatar-wrapper {
        position: relative;
        flex-shrink: 0;

        .avatar {
            width: 48px;
            height: 48px;
            object-fit: cover;
        }

        .badge {
            position: absolute;
            top: -6px;
            right: -6px;
            background-color: $color-error;
            color: white;
            font-size: 10px;
            padding: 0 4px;
            height: 16px;
            min-width: 16px;
            line-height: 16px;
            border-radius: 8px;
            text-align: center;
            border: 2px solid var(--bg-list);
        }
    }

    .info {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        justify-content: center;

        .name {
            font-size: 14px;
            font-weight: 500;
            color: $color-text-primary;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            margin-bottom: 2px;
        }

        .desc {
            font-size: 12px;
            color: $color-text-secondary;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
    }
}
</style>
