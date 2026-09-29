<template>
    <!-- 窗口是透明的：卡片以外的留白只用来画投影，点到那里等同点空白处收起 -->
    <div class="tray-menu" :style="{ padding: `${TRAY_MENU_CONFIG.shadowPadding}px` }" @click.self="close"
        @contextmenu.prevent>
        <div ref="cardRef" class="tray-menu__card" :class="{ 'is-entering': entering }">
            <div class="tray-menu__header">
                <img class="app-logo" :src="logo" alt="" @error="handleLogoError" />
                <span class="app-name">{{ APP_CONSTANTS.ApplicationName }}</span>
            </div>

            <div class="tray-menu__divider"></div>

            <div class="tray-menu__list">
                <button v-for="item in menuItems" :key="item.action" class="tray-menu__item"
                    :class="{ 'is-danger': item.danger }" @click="select(item.action)">
                    <component :is="item.icon" class="app-icon app-icon--sm item-icon" />
                    <span class="item-label">{{ item.label }}</span>
                </button>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { markRaw, nextTick, onMounted, onUnmounted, ref, type Component } from 'vue';
import { Home, Setting, PowerOff } from 'reicon-vue';
import { trayService } from '@/src/services';
import { APP_CONSTANTS, APP_ICON, TRAY_MENU_CONFIG } from '@shared/config/constants';
import { publicUrl } from '@/src/utils/resourceUrl';
import { TrayMenuAction } from '@shared/types/window';

interface TrayMenuItem {
    action: TrayMenuAction;
    label: string;
    icon: Component;
    /** 危险项（退出）：hover 走告警色 */
    danger?: boolean;
}

const menuItems: TrayMenuItem[] = [
    { action: TrayMenuAction.ShowHome, label: '打开主界面', icon: markRaw(Home) },
    { action: TrayMenuAction.OpenSettings, label: '设置', icon: markRaw(Setting) },
    { action: TrayMenuAction.Quit, label: `退出`, icon: markRaw(PowerOff), danger: true },
];

const logo = ref(publicUrl(APP_ICON.normal));
const cardRef = ref<HTMLElement | null>(null);
/**
 * 入场动画开关。窗口是复用的（只 hide 不销毁），所以卡片必须在收起时退回透明，
 * 下次显示才有起点可播 —— 顺带把 Windows 重新合成透明窗时可能露出的脏帧盖掉。
 */
const entering = ref(false);

const handleLogoError = () => {
    logo.value = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="%231890ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
};

/**
 * 把卡片实际占的尺寸报给主进程，窗口按它裁到刚好大小再贴着托盘图标弹出。
 * 卡片外还有一圈用于投影的透明留白，须一并算进窗口尺寸，否则投影会被窗口边缘切掉。
 */
const reportSize = () => {
    const el = cardRef.value;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const padding = TRAY_MENU_CONFIG.shadowPadding * 2;
    trayService.reportMenuSize({
        width: Math.ceil(width) + padding,
        height: Math.ceil(height) + padding,
    });
};

const select = (action: TrayMenuAction) => {
    trayService.runAction(action);
};

const close = () => {
    trayService.closeMenu();
};

const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') close();
};

/**
 * 窗口隐藏时把卡片退回透明。
 * 覆盖所有收起路径（失焦、点菜单项、Esc、点空白），因为它们最终都是主进程 hide 窗口；
 * 而"显示"用主进程的 TRAY_MENU_SHOW 驱动，两边不重复触发。
 *
 * 万一这里的 visibilitychange 不触发，卡片会一直停在不透明态，退化成"直接出现没有动画"，
 * 而不会卡在透明态导致菜单看不见。
 */
const handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
        entering.value = false;
    }
};

onMounted(async () => {
    // 本窗口是静默预创建的（配置 show: false），不发 WINDOW_READY；
    // 上报尺寸即代表"已备好"，主进程收到后把窗口裁到内容大小，等右键再定位显示
    await nextTick();
    reportSize();
    window.addEventListener('keydown', handleKeydown);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    trayService.onMenuShow(() => {
        entering.value = true;
    });
});

onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    trayService.offMenuShow();
});
</script>

<style scoped lang="scss">
@use "@/src/style/_constant.scss" as *;

.tray-menu {
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    display: flex;
    align-items: flex-start;
    background: transparent;
    // 父级 App.vue 给容器整体开了 drag，弹层必须显式关掉，否则菜单项点不动
    -webkit-app-region: no-drag;
    user-select: none;
}

.tray-menu__card {
    width: 120px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    padding: 6px;
    background: $bg-card;
    border: 1px solid $color-border;
    border-radius: var(--radius-lg, 12px);
    box-shadow: var(--shadow-md);
    transition: background-color $transition-base, border-color $transition-base;
    // 默认透明：窗口 show 的瞬间卡片不可见，把系统重新合成透明窗的那一两帧脏内容盖掉
    opacity: 0;

    &.is-entering {
        opacity: 1;
        animation: tray-menu-enter 140ms cubic-bezier(0.16, 1, 0.3, 1);
    }
}

// 菜单通常弹在托盘图标上方，所以从略靠下的位置往上浮
@keyframes tray-menu-enter {
    from {
        opacity: 0;
        transform: translateY(6px);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
}

@media (prefers-reduced-motion: reduce) {
    .tray-menu__card.is-entering {
        animation: none;
    }
}

.tray-menu__header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 6px 6px;

    .app-logo {
        width: 20px;
        height: 20px;
        border-radius: 6px;
        object-fit: contain;
        flex-shrink: 0;
    }

    .app-name {
        flex: 1;
        min-width: 0;
        font-size: $font-size-sm;
        font-weight: $font-weight-semibold;
        color: $color-text-title;
        @include ellipsis;
    }
}

.tray-menu__divider {
    height: 1px;
    margin: 0 2px 4px;
    background-color: $color-border-divider;
}

.tray-menu__list {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.tray-menu__item {
    display: flex;
    align-items: center;
    width: 100%;
    padding: 7px 8px;
    border: none;
    outline: none;
    background: transparent;
    border-radius: var(--radius-md, 8px);
    color: $color-text-primary;
    font-family: inherit;
    font-size: 13px;
    font-weight: 450;
    text-align: left;
    cursor: pointer;
    transition: background-color 0.2s ease, color 0.2s ease;

    .item-icon {
        margin-right: 8px;
        color: $color-text-secondary;
    }

    .item-label {
        flex: 1;
        min-width: 0;
        @include ellipsis;
    }

    &:hover {
        background-color: $bg-hover;
        color: $color-primary;

        .item-icon {
            color: $color-primary;
        }
    }

    &:active {
        background-color: $bg-active;
    }

    &.is-danger:hover {
        background-color: rgba(255, 77, 79, 0.12);
        color: $color-error;

        .item-icon {
            color: $color-error;
        }
    }
}
</style>
