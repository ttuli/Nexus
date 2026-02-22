<template>
    <label class="custom-checkbox" :class="{ 
        'is-checked': isChecked, 
        'is-disabled': disabled,
        'is-indeterminate': indeterminate 
    }">
        <span class="checkbox-input">
            <input
                type="checkbox"
                class="checkbox-original"
                :checked="isChecked"
                :disabled="disabled"
                :indeterminate="indeterminate"
                @change="handleChange"
            />
            <span class="checkbox-inner">
                <svg v-if="!indeterminate" class="checkbox-icon" viewBox="0 0 12 12">
                    <polyline points="2,6 5,9 10,3" />
                </svg>
                <span v-else class="checkbox-indeterminate-icon"></span>
            </span>
        </span>
        <span class="checkbox-label">
            <slot>{{ label }}</slot>
        </span>
    </label>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
    modelValue?: boolean | string | number
    label?: string
    trueValue?: boolean | string | number
    falseValue?: boolean | string | number
    disabled?: boolean
    indeterminate?: boolean
}

interface Emits {
    (e: 'update:modelValue', value: boolean | string | number): void
    (e: 'change', value: boolean | string | number): void
}

const props = withDefaults(defineProps<Props>(), {
    modelValue: false,
    label: '',
    trueValue: true,
    falseValue: false,
    disabled: false,
    indeterminate: false
})

const emit = defineEmits<Emits>()

const isChecked = computed(() => {
    return props.modelValue === props.trueValue
})

const handleChange = (event: Event) => {
    if (props.disabled) return
    
    const target = event.target as HTMLInputElement
    const newValue = target.checked ? props.trueValue : props.falseValue
    
    emit('update:modelValue', newValue)
    emit('change', newValue)
}
</script>

<style scoped lang="scss">
.custom-checkbox {
    -webkit-app-region: no-drag;
    display: inline-flex;
    align-items: center;
    cursor: pointer;
    user-select: none;
    font-size: 14px;
    line-height: 1;
    
    &.is-disabled {
        cursor: not-allowed;
        opacity: 0.5;
        
        .checkbox-input {
            cursor: not-allowed;
        }
    }
}

.checkbox-input {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    vertical-align: middle;
    cursor: pointer;
}

.checkbox-original {
    position: absolute;
    width: 100%;
    height: 100%;
    opacity: 0;
    margin: 0;
    cursor: pointer;
    
    &:disabled {
        cursor: not-allowed;
    }
}

.checkbox-inner {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border: 2px solid #d1d5db;
    border-radius: 4px;
    background-color: #fff;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    
    .checkbox-icon {
        width: 10px;
        height: 10px;
        opacity: 0;
        transform: scale(0);
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        
        polyline {
            fill: none;
            stroke: #fff;
            stroke-width: 2;
            stroke-linecap: round;
            stroke-linejoin: round;
        }
    }
    
    .checkbox-indeterminate-icon {
        width: 8px;
        height: 2px;
        background-color: #fff;
        border-radius: 1px;
        opacity: 0;
        transform: scale(0);
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    }
}

.checkbox-label {
    margin-left: 8px;
    line-height: 1.5;
}

// Hover state
.custom-checkbox:not(.is-disabled):hover {
    .checkbox-inner {
        border-color: #3b82f6;
    }
}

// Focus state
.checkbox-original:focus-visible + .checkbox-inner {
    outline: 2px solid #3b82f6;
    outline-offset: 2px;
}

// Checked state
.custom-checkbox.is-checked {
    .checkbox-inner {
        background-color: #3b82f6;
        border-color: #3b82f6;
        
        .checkbox-icon {
            opacity: 1;
            transform: scale(1);
        }
    }
}

// Indeterminate state
.custom-checkbox.is-indeterminate {
    .checkbox-inner {
        background-color: #3b82f6;
        border-color: #3b82f6;
        
        .checkbox-indeterminate-icon {
            opacity: 1;
            transform: scale(1);
        }
    }
}

// Active state
.custom-checkbox:not(.is-disabled):active {
    .checkbox-inner {
        transform: scale(0.9);
    }
}
</style>