<template>
    <ModalBackground :visible="visible" :zIndex="10000" @close="handleBackdropClick">
        <div class="cus-dialog-card" @click.stop>
            <button v-if="showClose" class="close-btn" @click="handleClose">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
            <div class="cus-dialog-header">
                <div v-if="status" :class="['status-icon-wrapper', status]">
                    <svg v-if="status === 'success'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                    <svg v-else-if="status === 'warning'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>
                    <svg v-else-if="status === 'danger'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
                    <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                </div>
                <h3 class="title">{{ title }}</h3>
            </div>
            <div class="cus-dialog-body">
                <slot></slot>
            </div>
            <div class="cus-dialog-footer">
                <button v-if="extraText" class="btn text" @click="handleExtra">
                    {{ extraText }}
                </button>
                <div class="button-group">
                    <button v-if="showCancel" class="btn secondary" @click="handleCancel">
                        {{ cancelText }}
                    </button>
                    <button :class="['btn', 'primary', status || 'accent']" @click="handleConfirm">
                        {{ confirmText }}
                    </button>
                </div>
            </div>
        </div>
    </ModalBackground>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import ModalBackground from '@/src/components/ModalBackground/ModalBackground.vue';
import { DialogResult, DialogStatus } from './types';

interface Props {
    title?: string;
    showCancel?: boolean;
    showClose?: boolean;
    confirmText?: string;
    cancelText?: string;
    extraText?: string;
    status?: DialogStatus;
}

withDefaults(defineProps<Props>(), {
    title: '提示',
    showCancel: true,
    showClose: true,
    confirmText: '确定',
    cancelText: '取消',
    extraText: '',
    status: undefined
});

const visible = ref(false);
let resolvePromise: (value: DialogResult) => void;

const open = () => {
    visible.value = true;
    return new Promise<DialogResult>((resolve) => {
        resolvePromise = resolve;
    });
};

const handleConfirm = () => {
    visible.value = false;
    resolvePromise(DialogResult.Confirm);
};

const handleCancel = () => {
    visible.value = false;
    resolvePromise(DialogResult.Cancel);
};

const handleClose = () => {
    visible.value = false;
    resolvePromise(DialogResult.Close);
};

const handleExtra = () => {
    visible.value = false;
    resolvePromise(DialogResult.Extra);
};

const handleBackdropClick = () => {
    // Option: Close on backdrop click (optional behavior)
    // handleCancel();
};

defineExpose({ open });
</script>

<style lang="scss" scoped>
@use "@/src/style/_constant.scss" as *;
@use "@/src/style/_mixins.scss" as *;

.cus-dialog-card {
    background: var(--surface-default, #ffffff);
    width: 400px;
    max-width: 90vw;
    border-radius: 16px;
    box-shadow: 0 20px 40px -8px rgba(0, 0, 0, 0.1), 0 10px 20px -8px rgba(0, 0, 0, 0.04);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid rgba(0, 0, 0, 0.08);
    user-select: none;
    position: relative;
    padding: 24px;
    box-sizing: border-box;

    transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

:deep(.fade-scale-enter-from),
:deep(.fade-scale-leave-to) {
    .cus-dialog-card {
        transform: scale(0.95) translateY(10px);
        opacity: 0;
    }
}

.close-btn {
    position: absolute;
    top: 16px;
    right: 16px;
    background: transparent;
    border: none;
    color: $color-text-placeholder;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    transition: all 0.2s;
    z-index: 10;
    padding: 0;

    &:hover {
        background: var(--bg-hover);
        color: $color-text-title;
    }
}

.cus-dialog-header {
    display: flex;
    flex-direction: row;
    align-items: center;
    margin-bottom: 10px;

    .status-icon-wrapper {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-right: 12px;
        flex-shrink: 0;

        &.success {
            background: rgba(23, 201, 100, 0.15);
            color: #17c964;
        }
        &.danger {
            background: rgba(243, 18, 96, 0.1);
            color: #f31260;
        }
        &.warning {
            background: rgba(245, 165, 36, 0.15);
            color: #f5a524;
        }
        &.accent, &.info {
            background: $color-primary-bg;
            color: $color-primary;
        }
    }

    .title {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
        color: $color-text-title;
        line-height: 1.4;
    }
}

.cus-dialog-body {
    margin-bottom: 20px;
    .content {
        margin: 0;
        font-size: 14px;
        line-height: 1.5;
        color: $color-text-primary;
        white-space: pre-wrap;
    }
}

.cus-dialog-footer {
    display: flex;
    justify-content: flex-end;
    align-items: center;

    .button-group {
        display: flex;
        gap: 12px;
    }

    // 附加操作靠左，把主按钮组推到右侧
    .btn.text {
        margin-right: auto;
    }
}

.btn {
    padding: 0 16px;
    height: 36px;
    border-radius: var(--radius-md, 8px);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    border: none;
    outline: none;
    display: flex;
    align-items: center;
    justify-content: center;

    &.secondary {
        background: var(--bg-disabled);
        color: $color-text-primary;

        &:hover {
            background: var(--bg-hover);
            color: $color-text-title;
        }
    }

    &.primary {
        @include primary-button;
        height: 36px; // Ensure height consistency
        border-radius: var(--radius-md, 8px);
    }

    &.text {
        padding: 0 4px;
        background: transparent;
        color: $color-text-secondary;
        font-weight: 400;

        &:hover {
            color: $color-primary;
        }
    }
}
</style>
