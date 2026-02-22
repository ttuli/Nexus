<template>
    <Transition name="fade-scale">
        <div v-if="visible" class="modal-background-overlay" :style="{
            zIndex: zIndex,
            background: maskColor,
            backdropFilter: `blur(${blur})`
        }" @click="handleBackdropClick">
            <div class="modal-content-wrapper" @click.stop>
                <slot></slot>
            </div>
        </div>
    </Transition>
</template>

<script setup lang="ts">
// Compiler macros are auto-imported in <script setup>

interface Props {
    visible?: boolean;
    zIndex?: number;
    maskColor?: string;
    blur?: string;
    closeOnBackdrop?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
    visible: false,
    zIndex: 1000,
    maskColor: 'rgba(0, 0, 0, 0.4)',
    blur: '8px',
    closeOnBackdrop: true
});

const emit = defineEmits<{
    (e: 'close'): void;
}>();

const handleBackdropClick = () => {
    if (props.closeOnBackdrop) {
        emit('close');
    }
};
</script>

<style lang="scss" scoped>
.modal-background-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    -webkit-app-region: no-drag;
}

.modal-content-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    /* Ensure content maintains its own styling */
}

/* Animations */
.fade-scale-enter-active,
.fade-scale-leave-active {
    transition: opacity 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);

    .modal-content-wrapper {
        transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
}

.fade-scale-enter-from,
.fade-scale-leave-to {
    opacity: 0;

    .modal-content-wrapper {
        transform: scale(0.95);
    }
}
</style>
