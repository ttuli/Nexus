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
@use "@/src/style/_constant.scss" as *;

.context-menu {
    position: fixed;
    z-index: 9999;
    background: var(--surface-default, #ffffff);
    border-radius: var(--radius-md, 8px);
    box-shadow: var(--shadow-md, 0 4px 12px rgba(0, 0, 0, 0.08));
    // padding: 6px;
    min-width: 120px;
    border: 1px solid var(--border-color, #e2e8f0);
    transform: v-bind("props.align === 'right' ? 'translateX(-100%)' : 'none'");
    display: flex;
    flex-direction: column;
    gap: 2px;
    
    @supports (backdrop-filter: blur(16px)) or (-webkit-backdrop-filter: blur(16px)) {
        background: rgba(255, 255, 255, 0.75);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        
        [data-theme='dark'] & {
            background: rgba(30, 41, 59, 0.75);
        }
    }
    
    [data-theme='dark'] & {
        background: var(--bg-card, #1e293b);
        border-color: var(--border-color, #334155);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
    }
}

.menu-item {
    padding: 6px 12px;
    font-size: 13px;
    color: var(--text-primary, #1e293b);
    cursor: pointer;
    border-radius: var(--radius-sm, 4px);
    transition: all 0.2s ease;
    display: flex;
    align-items: center;

    &:hover {
        background-color: var(--bg-hover, #f1f5f9);
        color: var(--color-primary, #1890ff);
        
        .menu-icon {
            color: var(--color-primary, #1890ff);
        }
    }

    .menu-icon {
        width: 16px;
        height: 16px;
        margin-right: 8px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-secondary, #64748b);
        transition: color 0.2s ease;

        :deep(svg) {
            width: 100%;
            height: 100%;
        }
    }

    .menu-label {
        flex: 1;
        font-weight: 450;
        text-align: left;
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
