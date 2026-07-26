<template>
    <div class="main-container" :class="{ dark: isDark }">
        <div class="center-content">
            <span class="title-content" v-if="props.title">{{ props.title }}</span>
            <div class="connection-status" v-if="wsState !== ConnectionState.CONNECTED && wsState !== ConnectionState.UNRECOGNIZED">
                <div class="status-item loading" v-if="wsState === ConnectionState.CONNECTING || wsState === ConnectionState.RECONNECTING">
                    <span class="spinner"></span>
                    <span class="text">连接中...</span>
                </div>
                <div class="status-item error" v-else>
                    <span class="text">连接服务器失败</span>
                </div>
            </div>
        </div>
        <button class="min-btn" @click="onMin" v-if="needMin">
            <Minus class="app-icon app-icon--xs" />
        </button>
        <button v-if="needMax" class="max-btn" @click="onMax">
            <ExitFullscreenSquare class="app-icon app-icon--xs" v-if="isMax" />
            <AspectRatioSquare class="app-icon app-icon--xs" v-else />
        </button>
        <button class="close-btn" @click="handleClose">
            <X class="app-icon app-icon--xs" />
        </button>
    </div>
</template>

<script lang="ts" setup>
import { Minus, AspectRatioSquare, ExitFullscreenSquare, X } from 'reicon-vue';
import { onMounted, onUnmounted, ref, computed } from 'vue';
import { windowService, websocketService } from '@/src/services';
import { ConnectionState } from '@shared/types';
import { theme as globalTheme } from '@/src/composables/useTheme';

const props = withDefaults(
    defineProps<{
        height?: string
        needMin?: boolean
        needMax?: boolean
        title?: string
        theme?: 'dark' | 'light' | 'auto'
    }>(),
    {
        height: '35px',
        needMin: true,
        needMax: false,
        title: '',
        theme: 'auto'
    }
)
const isMax = ref(false)
const wsState = ref(ConnectionState.UNRECOGNIZED)

const isDark = computed(() => {
    if (props.theme === 'dark') return true
    if (props.theme === 'light') return false
    return globalTheme.value === 'dark'
})

const onMin = () => {
    windowService.minimize()
}
const onMax = () => {
    windowService.maximize()
}
const handleClose = () => {
    windowService.close()
}

onMounted(() => {
    windowService.onWindowState((state) => {
        isMax.value = state === 'maximized'
    })
    websocketService.onStateChange((state) => {
        wsState.value = state
    })
})

onUnmounted(() => {
    websocketService.offStateChange()
})
</script>

<style lang="scss" scoped>
.main-container {
    position: relative;
    top: 0;
    left: 0;
    width: 100%;
    height: v-bind('props.height');
    display: flex;
    flex-direction: row;
    justify-content: flex-end;
    pointer-events: none;
    background-color: transparent;
    -webkit-app-region: drag;

    .center-content {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        display: flex;
        align-items: center;
        gap: 8px;
        max-width: 50%;
        pointer-events: none;
        justify-content: center;

        .title-content {
            font-size: 16px;
            color: $color-text-primary;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            min-width: 0;
            flex-shrink: 1;
        }

        .connection-status {
            display: flex;
            align-items: center;
            flex-shrink: 0;

            .status-item {
                display: flex;
                align-items: center;
                gap: 4px;
                padding: 2px 8px;
                border-radius: 4px;
                font-size: 12px;

                &.loading {
                    background-color: $color-primary-bg;
                    color: $color-primary;

                    .spinner {
                        width: 12px;
                        height: 12px;
                        border: 2px solid $color-primary;
                        border-top-color: transparent;
                        border-radius: 50%;
                        animation: spin 1s linear infinite;
                    }
                }

                &.error {
                    background-color: rgba(255, 77, 79, 0.1);
                    color: #ff4d4f; // We can keep error colors as they are unless we define an error token
                }
            }
        }
    }

    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }

    button {
        width: v-bind('props.height');
        height: v-bind('props.height');
        border: none;
        background-color: transparent;
        color: var(--text-primary);
        cursor: pointer;
        transition: all 0.3s ease;
        -webkit-app-region: no-drag;
        pointer-events: auto;
        display: flex;
        align-items: center;
        justify-content: center;

    }

    .close-btn {
        &:hover {
            background-color: red;
        }

        &:hover:active {
            background-color: #cc0000; // red 变暗 10%
        }
    }

    .max-btn {
        &:hover {
            background-color: rgba(163, 163, 163, 0.305);
        }

        &:hover:active {
            background-color: rgba(140, 140, 140, 0.305); // 变暗 10%
        }
    }

    .min-btn {
        &:hover {
            background-color: rgba(163, 163, 163, 0.305);
        }

        &:hover:active {
            background-color: rgba(140, 140, 140, 0.305); // 变暗 10%
        }
    }
}

.main-container.dark {
    .title-content {
        color: #e2e8f0; // Force white/light text when theme is dark
    }

    .center-content {
        .connection-status {
            .status-item {
                &.loading {
                    background-color: rgba(255, 255, 255, 0.08);
                    color: #40a9ff;

                    .spinner {
                        border-color: #40a9ff;
                        border-top-color: transparent;
                    }
                }
            }
        }
    }

    .max-btn,
    .min-btn {
        &:hover {
            background-color: rgba(255, 255, 255, 0.1);
        }

        &:hover:active {
            background-color: rgba(255, 255, 255, 0.2);
        }
    }
}
</style>