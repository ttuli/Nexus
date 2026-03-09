<template>
    <Teleport to="body">
        <!-- Overlay to close menu on outside click -->
        <div v-if="visible" class="menu-overlay" @click="close"></div>
        <div v-if="visible" class="context-menu" :style="{ top: y + 'px', left: x + 'px' }" @click.stop @mouseover.stop @mousemove.stop>
            <div v-for="(option, index) in options" :key="index" class="menu-item" @click.capture.stop="handleSelect(option)">
                <span v-if="option.icon" class="menu-icon" v-html="option.icon" />
                <span class="menu-label">{{ option.label }}</span>
            </div>
        </div>
    </Teleport>
</template>

<script setup lang="ts">
import { PropType } from 'vue';

export interface MenuOption {
    label: string;
    key: string;
    icon?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payload?: any;
}

const props = defineProps({
    visible: {
        type: Boolean,
        default: false
    },
    x: {
        type: Number,
        default: 0
    },
    y: {
        type: Number,
        default: 0
    },
    options: {
        type: Array as PropType<MenuOption[]>,
        default: () => []
    },
    align: {
        type: String as PropType<'left' | 'right'>,
        default: 'left'
    }
});

const emit = defineEmits(['select', 'close', 'update:visible']);

const handleSelect = (option: MenuOption) => {
    emit('select', option);
    close();
};

const close = () => {
    emit('close');
    emit('update:visible', false);
};


</script>

<style scoped lang="scss">
@use "@/style/_constant.scss" as *;

.context-menu {
    position: fixed;
    z-index: 9999;
    background: white;
    border-radius: 6px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
    padding: 4px 0;
    min-width: 100px;
    border: 1px solid $color-border;
    transform: v-bind("props.align === 'right' ? 'translateX(-100%)' : 'none'");
    // pointer-events: none;
}

.menu-item {
    padding: 5px 8px;
    font-size: 14px;
    color: $color-text-primary;
    cursor: pointer;
    transition: background-color 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;

    &:hover {
        background-color: $bg-hover;
        // background-color: black;
    }

    .menu-icon {
        width: 16px;
        height: 16px;
        margin-right: 8px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;

        :deep(svg) {
            width: 100%;
            height: 100%;
        }
    }

    .menu-label {
        flex: 1;
    }
}

.menu-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 9998;
    background: transparent;
}
</style>
