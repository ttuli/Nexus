<template>
    <Teleport to="body">
        <ModalBackground :visible="visible" @close="handleClose">
            <div class="cus-modal-card" :style="{ width: width }">
                <div class="modal-header">
                    <h3>{{ title }}</h3>
                    <button v-if="showClose" class="close-btn" @click="handleClose">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                    </button>
                </div>
                <div class="modal-body">
                    <slot></slot>
                </div>
                <div v-if="$slots.footer" class="modal-footer">
                    <slot name="footer"></slot>
                </div>
            </div>
        </ModalBackground>
    </Teleport>
</template>

<script setup lang="ts">
import ModalBackground from '@/src/components/ModalBackground/ModalBackground.vue';

interface Props {
    visible: boolean;
    title?: string;
    width?: string;
    showClose?: boolean;
}

withDefaults(defineProps<Props>(), {
    title: '',
    width: '400px',
    showClose: true
});

const emit = defineEmits<{
    (e: 'close'): void;
}>();

const handleClose = () => {
    emit('close');
};
</script>

<style lang="scss" scoped>
@use "@/src/style/_constant.scss" as *;

.cus-modal-card {
    background: var(--surface-default, #ffffff);
    border-radius: var(--radius-lg, 12px);
    overflow: hidden;
    box-shadow: var(--shadow-md, 0 4px 24px rgba(0, 0, 0, 0.15));
    display: flex;
    flex-direction: column;
    max-height: 85vh;
    box-sizing: border-box;

    [data-theme='dark'] & {
        background: var(--bg-card, #1e293b);
        border: 1px solid var(--border-color, #334155);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    }
}

.modal-header {
    padding: 16px 20px;
    border-bottom: 1px solid var(--border-divider, #e5e6eb);
    display: flex;
    justify-content: space-between;
    align-items: center;
    box-sizing: border-box;

    h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        color: var(--text-title, #1d2129);
    }

    .close-btn {
        background: none;
        border: none;
        color: var(--text-secondary, #4e5969);
        cursor: pointer;
        padding: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        transition: background-color 0.2s;

        &:hover {
            background-color: var(--bg-hover, #f2f3f5);
            color: var(--text-primary, #1d2129);
        }
    }
}

.modal-body {
    padding: 20px;
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
}

.modal-footer {
    padding: 16px 20px;
    border-top: 1px solid var(--border-divider, #e5e6eb);
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    box-sizing: border-box;
}
</style>
