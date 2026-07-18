<template>
    <ModalBackground :visible="visible" :z-index="10001" mask-color="rgba(0, 0, 0, 0.3)" blur="4px"
        :close-on-backdrop="false">
        <div class="loading-card">
            <CusSpinner :text="text" />
        </div>
    </ModalBackground>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import ModalBackground from '@/src/components/ModalBackground/ModalBackground.vue';
import CusSpinner from '@/src/components/CusSpinner.vue';

const visible = ref(false);
const text = ref('');

const open = (loadingText?: string) => {
    text.value = loadingText || '';
    visible.value = true;
    return new Promise<void>((resolve) => {
        resolve();
    });
};

const close = () => {
    visible.value = false;
};

defineExpose({ open, close });
</script>

<style lang="scss" scoped>
@use "@/src/style/_constant.scss" as *;

.loading-card {
    background: rgba(255, 255, 255, 0.85); // Glassish
    backdrop-filter: blur(12px);
    padding: 32px 48px;
    border-radius: 20px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(255, 255, 255, 0.4);
    min-width: 180px;

    /* Dark mode support if applicable */
    @media (prefers-color-scheme: dark) {
        background: rgba(30, 30, 30, 0.85);
        border: 1px solid rgba(255, 255, 255, 0.1);
    }
}
</style>
