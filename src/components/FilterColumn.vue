<template>
    <div class="filter-column">
        <div class="search-wrapper">
            <div class="search-input-box">
                <img :src="SearchIcon" class="search-icon" />
                <input class="search-input" placeholder="搜索" />
            </div>
            <button class="add-btn" @click="toggleMenu" ref="addBtnRef">
                <img :src="PlusIcon" class="add-icon" />
            </button>
        </div>
        <ContextMenu v-model:visible="menuVisible" :x="menuX" :y="menuY" :options="menuOptions" align="right"
            @select="handleMenuSelect" />

    </div>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import SearchIcon from '@/assets/input/search.svg?url';
import PlusIcon from '@/assets/input/plus.svg?url';

import ContextMenu, { MenuOption } from '@/components/ContextMenu.vue';
const emit = defineEmits<{
    (e: 'menu-select', key: string): void;
}>();

const addBtnRef = ref<HTMLElement | null>(null);
const menuVisible = ref(false);

const menuX = ref(0);
const menuY = ref(0);

const menuOptions: MenuOption[] = [
    { label: '添加关系', key: 'search', icon: SearchIcon },
    { label: '发起群聊', key: 'createGroup', icon: PlusIcon }
];

const toggleMenu = (event: MouseEvent) => {
    if (menuVisible.value) {
        menuVisible.value = false;
        return;
    }

    // Calculate position
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    menuX.value = rect.right;
    menuY.value = rect.bottom + 5;
    menuVisible.value = true;
};

const handleMenuSelect = (option: MenuOption) => {
    emit('menu-select', option.key);
};
</script>

<style lang="scss" scoped>
@use "@/style/_constant.scss" as *;

.filter-column {
    width: 100%;
    height: 65px;
    display: flex;
    align-items: center;
    padding: 0 $spacing-md;
    box-sizing: border-box;
    background-color: $bg-card; // Ensure background matches the theme
    z-index: 1;
    // border-bottom: 1px solid $color-border; // Optional: separate from list

    .search-wrapper {
        width: 100%;
        display: flex;
        align-items: center;
        gap: $spacing-sm;
        height: 100%;

        .search-input-box {
            flex: 1;
            height: 32px;
            min-width: 0;
            background-color: $bg-body; // Slightly darker than card
            border-radius: 4px;
            display: flex;
            align-items: center;
            padding: 0 $spacing-sm;
            transition: all $transition-base;
            border: 1px solid transparent;

            -webkit-app-region: no-drag; // Ensure clickable in draggable window

            &:focus-within {
                background-color: $bg-card;
                border-color: $color-primary;
                box-shadow: 0 0 0 2px rgba($color-primary, 0.1);
            }

            .search-icon {
                width: 16px;
                height: 16px;
                opacity: 0.5;
                margin-right: $spacing-xs;
            }

            .search-input {
                flex: 1;
                border: none;
                background: none;
                height: 100%;
                font-size: $font-size-sm;
                color: $color-text-primary;
                outline: none;
                min-width: 0;

                &::placeholder {
                    color: $color-text-placeholder;
                }
            }
        }

        .add-btn {
            width: 32px;
            height: 32px;
            border-radius: 4px;
            background-color: $bg-body;
            border: none;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all $transition-base;
            padding: 0;
            -webkit-app-region: no-drag; // Ensure clickable in draggable window

            .add-icon {
                width: 18px;
                height: 18px;
                opacity: 0.6;
                transition: transform $transition-base;
            }

            &:hover {
                background-color: $bg-hover;
                // better to use a var if defined for hover, using opacity for now
                opacity: 0.8;

                .add-icon {
                    transform: rotate(90deg);
                    opacity: 1;
                    color: $color-primary; // Note: img src color won't change this way unless using masking or svg component
                }
            }

            &:active {
                transform: scale(0.95);
            }
        }
    }
}
</style>