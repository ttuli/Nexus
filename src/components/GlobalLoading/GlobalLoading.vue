<template>
    <ModalBackground :visible="visible" :z-index="10001" mask-color="rgba(0, 0, 0, 0.3)" blur="4px"
        :close-on-backdrop="false">
        <div class="loading-card">
            <div class="spinner-container">
                <div class="spinner"></div>
            </div>
            <div v-if="text" class="loading-text">{{ text }}</div>
        </div>
    </ModalBackground>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import ModalBackground from '@/components/ModalBackground/ModalBackground.vue';

const visible = ref(false);
const text = ref('');

const open = (loadingText?: string) => {
    text.value = loadingText || '';
    visible.value = true;
    return new Promise<void>((resolve) => {
        // Just resolve immediately or keep it active until close is called
        resolve();
    });
};

const close = () => {
    visible.value = false;
};

defineExpose({ open, close });
</script>

<style lang="scss" scoped>
@use "@/style/_constant.scss" as *;



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

.spinner-container {
    margin-bottom: 0;

    // If text exists, add margin
    &:has(+ .loading-text) {
        margin-bottom: 16px;
    }
}

.spinner {
    width: 40px;
    height: 40px;
    border: 4px solid rgba($color-primary, 0.3);
    border-top: 4px solid $color-primary;
    border-radius: 50%;
    animation: spin 1s linear infinite;
}

.loading-text {
    font-size: 16px;
    font-weight: 500;
    color: $color-text-primary;
    text-align: center;
}

@keyframes spin {
    0% {
        transform: rotate(0deg);
    }

    100% {
        transform: rotate(360deg);
    }
}
</style>
