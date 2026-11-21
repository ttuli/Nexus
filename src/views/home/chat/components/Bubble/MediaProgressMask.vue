<template>
    <transition name="fade-reveal">
        <div class="upload-mask" :class="{ 'is-finishing': finished }" v-show="!finished">
            <div class="custom-progress" :class="{ 'can-cancel': canCancel }">
                <div class="progress-display">
                    <svg class="progress-ring" :class="{ 'is-spinning': indeterminate }" width="44" height="44">
                        <circle
                            class="ring-bg"
                            stroke="rgba(255,255,255,0.3)"
                            stroke-width="3"
                            fill="transparent"
                            r="18"
                            cx="22"
                            cy="22"
                        />
                        <circle
                            class="ring-progress"
                            stroke="#fff"
                            stroke-width="3"
                            fill="transparent"
                            :stroke-dasharray="113"
                            :stroke-dashoffset="indeterminate ? 85 : 113 - (progress / 100) * 113"
                            stroke-linecap="round"
                            r="18"
                            cx="22"
                            cy="22"
                        />
                    </svg>
                    <span v-if="!indeterminate" class="progress-text">{{ progress }}%</span>
                </div>
                <div v-if="canCancel" class="cancel-btn">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                    </svg>
                </div>
            </div>
        </div>
    </transition>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
    finished: boolean;
    progress?: number;
    indeterminate?: boolean;
    canCancel?: boolean;
}>(), {
    progress: 0,
    indeterminate: false,
    canCancel: false,
});
</script>

<style scoped lang="scss">
.upload-mask {
    position: absolute;
    inset: 0;
    background-color: rgba(0, 0, 0, 0.282);
    display: flex;
    align-items: center;
    justify-content: center;
    clip-path: circle(100% at center);
    transition: clip-path 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.4s ease;
    z-index: 10;

    .custom-progress {
        position: relative;
        width: 44px;
        height: 44px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: opacity 0.3s ease, transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);

        .progress-display {
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: opacity 0.2s ease;

            .progress-ring {
                transform: rotate(-90deg);

                &.is-spinning {
                    animation: media-progress-spin 1s linear infinite;
                }

                circle {
                    transition: stroke-dashoffset 0.2s linear;
                }
            }

            .progress-text {
                position: absolute;
                font-size: 11px;
                color: #fff;
                font-weight: 500;
                font-family: monospace;
            }
        }

        .cancel-btn {
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #fff;
            opacity: 0;
            transition: opacity 0.2s ease;
            border-radius: 50%;
            background-color: rgba(255, 255, 255, 0.2);
        }

        &.can-cancel:hover {
            .progress-display {
                opacity: 0;
            }

            .cancel-btn {
                opacity: 1;
            }
        }
    }

    &.is-finishing {
        opacity: 0;

        .custom-progress {
            opacity: 0;
            transform: scale(1.5);
        }
    }
}

@keyframes media-progress-spin {
    from {
        transform: rotate(-90deg);
    }

    to {
        transform: rotate(270deg);
    }
}

.fade-reveal-enter-active,
.fade-reveal-leave-active {
    transition: opacity 0.4s;
}

.fade-reveal-enter-from,
.fade-reveal-leave-to {
    opacity: 0;
}
</style>
