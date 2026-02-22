<template>
    <ModalBackground :visible="visible" :zIndex="10000" @close="handleBackdropClick">
        <div class="cus-dialog-card" @click.stop>
            <div class="cus-dialog-header">
                <button v-if="showClose" class="close-btn" @click="handleClose">×</button>
                <h3 class="title">{{ title }}</h3>
            </div>
            <div class="cus-dialog-body">
                <p class="content">{{ content }}</p>
            </div>
            <div class="cus-dialog-footer">
                <div class="button-group">
                    <button v-if="showCancel" class="btn secondary" @click="handleCancel">
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
import { ref } from 'vue';
import ModalBackground from '@/components/ModalBackground/ModalBackground.vue';
import { DialogResult } from './types';

interface Props {
    title?: string;
    content?: string;
    showCancel?: boolean;
    showClose?: boolean;
    confirmText?: string;
    cancelText?: string;
}

withDefaults(defineProps<Props>(), {
    title: '提示',
    content: '',
    showCancel: true,
    showClose: false,
    confirmText: '确定',
    cancelText: '取消'
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

const handleBackdropClick = () => {
    // Option: Close on backdrop click (optional behavior)
    // handleCancel();
};

defineExpose({ open });
</script>



<style lang="scss" scoped>
@use "@/style/_constant.scss" as *;

.cus-dialog-card {
    background: $bg-card;
    width: 400px;
    max-width: 90vw;
    border-radius: 20px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.1);
    user-select: none;

    // Animation integration for child element
    transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

// Coordinate entering/leaving with the parent ModalBackground
:deep(.fade-scale-enter-from),
:deep(.fade-scale-leave-to) {
    .cus-dialog-card {
        transform: scale(0.9) translateY(20px);
        opacity: 0; // Ensure it fades out too if not handled by parent opacity
    }
}

.cus-dialog-header {
    padding: 24px 24px 12px;
    display: flex;
    align-items: center;

    .close-btn {
        background: none;
        border: none;
        font-size: 24px;
        color: $color-text-secondary;
        cursor: pointer;
        padding: 4px;
        line-height: 1;
        margin-right: 12px;
        border-radius: 50%;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;

        &:hover {
            background-color: rgba(0, 0, 0, 0.05);
            color: $color-text-primary;
        }
    }

    .title {
        margin: 0;
        font-size: 20px;
        font-weight: 700;
        color: $color-text-primary;
        flex: 1;
    }
}

.cus-dialog-body {
    padding: 0 24px 24px;

    .content {
        margin: 0;
        font-size: 16px;
        line-height: 1.6;
        color: $color-text-secondary;
        white-space: pre-wrap;
    }
}

.cus-dialog-footer {
    padding: 16px 24px 24px;
    display: flex;
    justify-content: flex-end;

    .button-group {
        display: flex;
        gap: 12px;
    }
}

.btn {
    padding: 10px 24px;
    border-radius: 12px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
    border: none;
    outline: none;

    &.primary {
        background: $color-primary;
        color: #ffffff;

        &:hover {
            background: $color-primary-dark;
            transform: translateY(-2px);
            box-shadow: 0 8px 20px rgba($color-primary, 0.3);
        }

        &:active {
            transform: translateY(0);
        }
    }

    &.secondary {
        background: $bg-body;
        color: $color-text-secondary;

        &:hover {
            background: $bg-hover;
            color: $color-text-primary;
        }
    }
}
</style>
