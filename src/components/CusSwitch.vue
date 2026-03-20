<template>
    <div class="cus-switch" :class="{ 'is-checked': isChecked, 'is-loading': loading }" @click="toggle">
        <div class="cus-switch__core" :style="{ backgroundColor: isChecked ? activeColor : inactiveColor }">
            <span class="cus-switch__action">
                <span v-if="loading" class="loading-icon"></span>
            </span>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
    modelValue?: boolean | number | string;
    loading?: boolean;
    activeValue?: boolean | number | string;
    inactiveValue?: boolean | number | string;
    activeColor?: string;
    inactiveColor?: string;
}>(), {
    modelValue: false,
    loading: false,
    activeValue: true,
    inactiveValue: false,
});

const emit = defineEmits(['update:modelValue', 'change']);

const isChecked = computed(() => {
    return props.modelValue === props.activeValue;
});

const toggle = () => {
    if (props.loading) return;
    const newValue = isChecked.value ? props.inactiveValue : props.activeValue;
    emit('update:modelValue', newValue);
    emit('change', newValue);
};
</script>

<style scoped lang="scss">
@use "@/style/constant.scss" as *;

.cus-switch {
    display: inline-flex;
    align-items: center;
    position: relative;
    font-size: 14px;
    height: 22px;
    vertical-align: middle;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;

    &.is-loading {
        cursor: not-allowed;
        opacity: 0.8;
    }

    &__core {
        margin: 0;
        display: inline-block;
        position: relative;
        width: 40px;
        height: 22px;
        border-radius: 11px;
        box-sizing: border-box;
        background-color: #e4e4e4;
        transition: background-color 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.05);
    }

    &__action {
        position: absolute;
        top: 2px;
        left: 2px;
        border-radius: 50%;
        transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        width: 18px;
        height: 18px;
        background-color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);

        .loading-icon {
            width: 10px;
            height: 10px;
            border: 2px solid transparent;
            border-top-color: $color-primary;
            border-radius: 50%;
            animation: cus-switch-loading 1s linear infinite;
        }
    }

    &.is-checked {
        .cus-switch__core {
            background-color: $color-primary;
        }

        .cus-switch__action {
            transform: translateX(18px);
        }
    }
}

@keyframes cus-switch-loading {
    0% {
        transform: rotate(0deg);
    }

    100% {
        transform: rotate(360deg);
    }
}
</style>
