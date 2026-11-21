<template>
    <div class="contact-item" :class="{ active }" @click.capture.stop="handleClick">
        <div class="avatar-wrapper">
            <Avatar :uid="id" :type="type" :width="'40px'" :height="'40px'" disable-click class="avatar" />
        </div>
        <div class="info">
            <div class="name-row">
                <span class="name">{{ name }}</span>
                <span v-if="subName" class="sub-name">({{ subName }})</span>
            </div>
            <div v-if="desc" class="desc">{{ desc }}</div>
        </div>
    </div>
</template>

<script setup lang="ts">

interface Props {
    id: number;
    type?: 'user' | 'group';
    name: string;
    subName?: string;
    desc?: string;
    active?: boolean;
}

withDefaults(defineProps<Props>(), {
    type: 'user',
    active: false,
});

const emit = defineEmits<{
    (e: 'click'): void;
}>();

const handleClick = () => {
    emit('click');
};
</script>

<style scoped lang="scss">
.contact-item {
    display: flex;
    align-items: center;
    padding: 8px 10px;
    gap: 12px;
    border-radius: 8px;
    cursor: pointer;
    user-select: none;
    background-color: transparent;
    width: 100%;
    box-sizing: border-box;
    transition: background-color 0.15s ease;

    &:hover {
        background-color: var(--bg-hover);
    }

    &.active {
        background-color: var(--bg-active);

        .info .name-row .name {
            color: $color-primary;
        }
    }

    .avatar-wrapper {
        position: relative;
        flex-shrink: 0;
        width: 40px;
        height: 40px;
        pointer-events: none;

        .avatar {
            width: 40px;
            height: 40px;
        }
    }

    .info {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 2px;

        .name-row {
            display: flex;
            align-items: baseline;
            gap: 4px;
            min-width: 0;

            .name {
                font-size: 14px;
                font-weight: 500;
                line-height: 20px;
                color: $color-text-primary;
                @include ellipsis;
                transition: color 0.15s ease;
            }

            .sub-name {
                flex-shrink: 1;
                min-width: 0;
                font-size: 12px;
                line-height: 18px;
                color: $color-text-placeholder;
                @include ellipsis;
            }
        }

        .desc {
            font-size: 12px;
            line-height: 18px;
            color: $color-text-secondary;
            @include ellipsis;
        }
    }
}
</style>
