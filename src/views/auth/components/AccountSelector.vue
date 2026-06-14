<template>
    <div class="account-selector" v-click-outside="closeDropdown" @keydown.enter.prevent="closeDropdown">
        <!-- Input Field -->
        <div class="input-container" :class="{ 'is-focus': isFocused }">
            <div class="left-icon">
                <slot name="left-area">
                </slot>
            </div>
            <input ref="inputRef" class="custom-input" :value="modelValue" :placeholder="placeholder"
                @input="handleInput" @focus="handleFocus" @click="openDropdown" />
            <!-- Optional: Arrow icon to indicate dropdown -->
            <div class="right-icon" @click.stop="toggleDropdown">
                <img :src="ArrowDownIcon" class="arrow-icon" :class="{ 'is-open': visible }" />
            </div>
        </div>

        <!-- Custom Dropdown -->
        <transition name="slide-fade">
            <div class="custom-dropdown" v-if="visible && filteredOptions.length > 0">
                <div v-for="item in filteredOptions" :key="item.account" class="dropdown-item"
                    @click="selectOption(item)">
                    <img :src="item.avatar || DefaultAvatar" class="item-avatar" />
                    <div class="item-info">
                        <span class="item-name">{{ item.name }}</span>
                        <span class="item-account">{{ item.account }}</span>
                    </div>
                    <!-- Delete button could go here -->
                </div>
            </div>
        </transition>
    </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { ClickOutside as vClickOutside } from 'element-plus';
// Use a generic default avatar if specific one is missing
import DefaultAvatar from '@/src/assets/avatar/default.png?url';
// We might need an arrow icon
import ArrowDownIcon from '@/src/assets/input/arrow_down.svg?url'; // Assuming this exists or I will use a simple svg content

export interface AccountOption {
    account: string;
    name: string;
    avatar: string;
}

interface Props {
    modelValue: string;
    options?: AccountOption[];
    placeholder?: string;
}

const props = withDefaults(defineProps<Props>(), {
    modelValue: '',
    options: () => [],
    placeholder: '请输入账号'
});

const emit = defineEmits<{
    (e: 'update:modelValue', value: string): void;
    (e: 'change', value: string): void;
}>();

const visible = ref(false);
const isFocused = ref(false);
const inputRef = ref<HTMLInputElement>();
const isExpandedAll = ref(false);

// Filter options based on input
const filteredOptions = computed(() => {
    // If expanded by arrow click, show all options
    if (isExpandedAll.value) {
        return props.options;
    }
    if (!props.modelValue) return props.options;
    // Simple filter: match account or name
    const val = props.modelValue.toLowerCase();
    return props.options.filter(opt =>
        opt.account.toLowerCase().includes(val) ||
        opt.name.toLowerCase().includes(val)
    );
});

const handleInput = (event: Event) => {
    const val = (event.target as HTMLInputElement).value;
    emit('update:modelValue', val);
    emit('change', val);
    isExpandedAll.value = false; // Reset to allow filtering
    visible.value = true;
};

const handleFocus = () => {
    isFocused.value = true;
    if (!visible.value) {
        isExpandedAll.value = false; // Focus implies typing/filtering usually, unless already open
        visible.value = true;
    }
}

const openDropdown = () => {
    isExpandedAll.value = false;
    visible.value = true;
};

const closeDropdown = () => {
    visible.value = false;
    isFocused.value = false;
    isExpandedAll.value = false;
};

const toggleDropdown = () => {
    if (visible.value) {
        visible.value = false;
        isExpandedAll.value = false;
    } else {
        isExpandedAll.value = true; // Show all on manual open
        visible.value = true;
        inputRef.value?.focus();
    }
}

const selectOption = (item: AccountOption) => {
    emit('update:modelValue', item.account);
    emit('change', item.account);
    visible.value = false;
};

</script>

<style lang="scss" scoped>
.account-selector {
    position: relative;
    width: 100%;
    -webkit-app-region: no-drag;
}

.input-container {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: 48px;
    border-radius: 8px;
    padding: 0 16px;
    box-sizing: border-box;
    transition: border-color 0.2s, box-shadow 0.2s, background-color 0.2s;
    background-color: #fcfcfc;
    border: 1px solid #e5e7eb;

    &.is-focus {
        border-color: #1890ff;
        box-shadow: 0 0 0 3px rgba(24, 144, 255, 0.1);
        background-color: #ffffff;
    }

    .left-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 30px;
        height: 30px;
        flex-shrink: 0;
    }

    .custom-input {
        flex: 1;
        border: none;
        outline: none;
        background: transparent;
        font-size: 15px;
        color: #0f172a;
        line-height: 1.5;
        padding: 12px 0;

        &::placeholder {
            color: #94a3b8;
        }
    }

    .right-icon {
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;

        .arrow-icon {
            width: 12px;
            height: 12px;
            transition: transform 0.3s;
            opacity: 0.5;

            &.is-open {
                transform: rotate(180deg);
            }
        }
    }
}

.custom-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    width: 100%;
    margin-top: 8px;
    background: white;
    border-radius: 12px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
    z-index: 2000;
    max-height: 110px;
    overflow-y: auto;
    -webkit-app-region: no-drag;
    padding: 8px 0;

    .dropdown-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 16px;
        cursor: pointer;
        transition: background-color 0.2s;

        &:hover {
            background-color: #f5f7fa;
        }

        .item-avatar {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            object-fit: cover;
            background-color: #f0f0f0;
            flex-shrink: 0;
        }

        .item-info {
            display: flex;
            flex-direction: column;
            line-height: 1.3;
            overflow: hidden;

            .item-name {
                font-size: 14px;
                color: #333;
                font-weight: 500;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .item-account {
                font-size: 12px;
                color: #999;
            }
        }
    }
}

/* Scrollbar styling */
.custom-dropdown::-webkit-scrollbar {
    width: 6px;
}

.custom-dropdown::-webkit-scrollbar-thumb {
    background-color: #e0e0e0;
    border-radius: 3px;
}

.custom-dropdown::-webkit-scrollbar-track {
    background: transparent;
}

/* Transitions */
.slide-fade-enter-active {
    transition: all 0.2s ease-out;
}

.slide-fade-leave-active {
    transition: all 0.1s cubic-bezier(1, 0.5, 0.8, 1);
}

.slide-fade-enter-from,
.slide-fade-leave-to {
    transform: translateY(-5px);
    opacity: 0;
}
</style>
