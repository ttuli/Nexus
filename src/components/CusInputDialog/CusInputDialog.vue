<template>
    <ModalBackground :visible="visible" :zIndex="10" @close="handleBackdropClick">
        <div class="cus-input-dialog-card" @click.stop>
            <div class="dialog-header">
                <h3 class="title">{{ title }}</h3>
                <button v-if="showClose" class="close-btn" @click="handleClose">×</button>
            </div>
            <div class="dialog-body">
                <input ref="inputRef" v-model="inputValue" type="text" class="input-field" :placeholder="placeholder"
                    :maxlength="maxLength" @keydown.enter="handleConfirm" />
            </div>
            <div class="dialog-footer">
                <div class="button-group">
                    <button class="btn secondary" @click="handleCancel">
                        {{ cancelText }}
                    </button>
                    <button class="btn primary" @click="handleConfirm">
                        {{ confirmText }}
                    </button>
                </div>
            </div>
        </div>
    </ModalBackground>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue';
import ModalBackground from '@/components/ModalBackground/ModalBackground.vue';
import { ElMessage } from 'element-plus';

interface Props {
    title?: string;
    placeholder?: string;
    confirmText?: string;
    cancelText?: string;
    initialValue?: string;
    maxLength?: number;
    showClose?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
    title: '输入',
    placeholder: '请输入内容',
    confirmText: '确定',
    cancelText: '取消',
    initialValue: '',
    showClose: true
});

const visible = ref(false);
const inputValue = ref(props.initialValue);
const inputRef = ref<HTMLInputElement | null>(null);

let resolvePromise: (value: string | undefined) => void;

const open = () => {
    visible.value = true;
    inputValue.value = props.initialValue;
    nextTick(() => {
        inputRef.value?.focus();
    });
    return new Promise<string | undefined>((resolve) => {
        resolvePromise = resolve;
    });
};

const handleConfirm = () => {
    if (!inputValue.value.trim()) {
        ElMessage.error('内容不能为空');
        return;
    }
    visible.value = false;
    resolvePromise(inputValue.value.trim());
};

const handleCancel = () => {
    visible.value = false;
    resolvePromise(undefined);
};

const handleClose = () => {
    visible.value = false;
    resolvePromise(undefined);
};

const handleBackdropClick = () => {
    // Optional: close on backdrop click
    // handleCancel();
};

defineExpose({ open });
</script>

<style lang="scss" scoped>
@use "@/style/_constant.scss" as *;

.cus-input-dialog-card {
    background: $bg-card;
    width: 400px;
    max-width: 90vw;
    border-radius: 12px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: dialog-in 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
    user-select: none;
}

@keyframes dialog-in {
    from {
        transform: scale(0.9);
        opacity: 0;
    }

    to {
        transform: scale(1);
        opacity: 1;
    }
}

.dialog-header {
    padding: 20px 24px 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;

    .title {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
        color: $color-text-primary;
    }

    .close-btn {
        background: none;
        border: none;
        font-size: 20px;
        color: $color-text-secondary;
        cursor: pointer;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        transition: background-color 0.2s;

        &:hover {
            background-color: rgba(0, 0, 0, 0.05);
            color: $color-text-primary;
        }
    }
}

.dialog-body {
    padding: 0 24px 24px;

    .input-field {
        width: 100%;
        padding: 10px 12px;
        border: 1px solid $color-border;
        border-radius: 8px;
        font-size: 14px;
        color: $color-text-primary;
        outline: none;
        transition: border-color 0.2s;
        box-sizing: border-box;

        &:focus {
            border-color: $color-primary;
        }

        &::placeholder {
            color: $color-text-placeholder;
        }
    }
}

.dialog-footer {
    padding: 12px 24px 20px;
    display: flex;
    justify-content: flex-end;

    .button-group {
        display: flex;
        gap: 12px;
    }
}

.btn {
    padding: 8px 20px;
    border-radius: 8px;
    font-size: 14px;
    cursor: pointer;
    border: none;
    outline: none;
    transition: all 0.2s;

    &.primary {
        background: $color-primary;
        color: #ffffff;

        &:hover {
            background: $color-primary-dark;
        }
    }

    &.secondary {
        background: $bg-body;
        color: $color-text-secondary;
        border: 1px solid $color-border;

        &:hover {
            background: $bg-hover;
            color: $color-text-primary;
        }
    }
}
</style>
