<template>
    <Teleport to="body">
        <div v-if="visible" ref="menuRef" class="context-menu"
            :style="{ top: posY + 'px', left: posX + 'px', visibility: ready ? 'visible' : 'hidden' }"
            @click.stop @mouseover.stop @mousemove.stop>
            <div v-for="(option, index) in options" :key="index" class="menu-item" @click.capture.stop="handleSelect(option)">
                <component v-if="typeof option.icon === 'object' || typeof option.icon === 'function'" :is="option.icon" class="menu-icon app-icon app-icon--sm" />
                <span v-else-if="option.icon" class="menu-icon" v-html="option.icon" />
                <span class="menu-label">{{ option.label }}</span>
            </div>
        </div>
    </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onUnmounted, type Component, type PropType } from 'vue';

export interface MenuOption {
    label: string;
    key: string;
    icon?: string | Component;
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

// 视口边距：菜单整体与窗口边缘保持的最小间距
const VIEWPORT_MARGIN = 8;

const menuRef = ref<HTMLElement | null>(null);
const posX = ref(0);
const posY = ref(0);
// 测量并收敛坐标前先隐藏，避免在溢出位置先渲染再跳回造成闪烁
const ready = ref(false);

const handleOutsideAction = (event: Event) => {
    if (!props.visible) return;
    const target = event.target as Node | null;
    if (menuRef.value && target && !menuRef.value.contains(target)) {
        close();
    }
};

const addOutsideListeners = () => {
    window.addEventListener('pointerdown', handleOutsideAction, true);
    window.addEventListener('mousedown', handleOutsideAction, true);
    window.addEventListener('click', handleOutsideAction, true);
    window.addEventListener('contextmenu', handleOutsideAction, true);
};

const removeOutsideListeners = () => {
    window.removeEventListener('pointerdown', handleOutsideAction, true);
    window.removeEventListener('mousedown', handleOutsideAction, true);
    window.removeEventListener('click', handleOutsideAction, true);
    window.removeEventListener('contextmenu', handleOutsideAction, true);
};

/**
 * 以点击点为锚点定位，再按菜单实际尺寸做视口收敛：
 * 贴右/下边缘时整体朝内平移，保证菜单不超出边界（仍尽量贴近点击点）。
 */
async function adjustPosition() {
    ready.value = false;
    posX.value = props.x;
    posY.value = props.y;

    await nextTick();
    const el = menuRef.value;
    if (!el) return;

    const { offsetWidth: w, offsetHeight: h } = el;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // align='right' 时以点击点为右边缘，菜单占据 [x - w, x]
    let left = props.align === 'right' ? props.x - w : props.x;
    if (left + w > vw - VIEWPORT_MARGIN) left = vw - w - VIEWPORT_MARGIN;
    if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;

    let top = props.y;
    if (top + h > vh - VIEWPORT_MARGIN) top = vh - h - VIEWPORT_MARGIN;
    if (top < VIEWPORT_MARGIN) top = VIEWPORT_MARGIN;

    posX.value = left;
    posY.value = top;
    ready.value = true;
}

// 监听 visible 改变
watch(
    () => props.visible,
    (visible) => {
        if (visible) {
            adjustPosition();
            nextTick(() => {
                addOutsideListeners();
            });
        } else {
            ready.value = false;
            removeOutsideListeners();
        }
    },
    { immediate: true }
);

// 监听坐标改变
watch(
    () => [props.x, props.y],
    () => {
        if (props.visible) {
            adjustPosition();
        }
    }
);

onUnmounted(() => {
    removeOutsideListeners();
});

const handleSelect = (option: MenuOption) => {
    emit('select', option);
    close();
};

const close = () => {
    removeOutsideListeners();
    emit('close');
    emit('update:visible', false);
};


</script>

<style scoped lang="scss">
@use "@/src/style/_constant.scss" as *;

.context-menu {
    position: fixed;
    z-index: 9999;
    background: var(--bg-card);
    border-radius: var(--radius-md, 8px);
    box-shadow: var(--shadow-md);
    // padding: 4px;
    min-width: 120px;
    border: 1px solid var(--border-color);
    display: flex;
    flex-direction: column;
    gap: 2px;
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
</style>
