<template>
    <div class="main-container" :class="{ dark: props.theme === 'dark' }">
        <div class="center-content">
            <span class="title-content" v-if="props.title">{{ props.title }}</span>
            <div class="connection-status" v-if="wsState !== ImTypes.ConnectionState.CONNECTED && wsState !== ImTypes.ConnectionState.UNRECOGNIZED">
                <div class="status-item loading" v-if="wsState === ImTypes.ConnectionState.CONNECTING || wsState === ImTypes.ConnectionState.RECONNECTING">
                    <span class="spinner"></span>
                    <span class="text">连接中...</span>
                </div>
                <div class="status-item error" v-else>
                    <span class="text">连接服务器失败</span>
                </div>
            </div>
        </div>
        <button class="min-btn" @click="onMin" v-if="needMin">
            <img :src="Min"></img>
        </button>
        <button v-if="needMax" class="max-btn" @click="onMax">
            <img :src="UnMax" v-if="isMax"></img>
            <img :src="Max" v-else></img>
        </button>
        <button class="close-btn" @click="onClose">
            <img :src="X"></img>
        </button>
    </div>
</template>

<script lang="ts" setup>
import Min from '@/assets/Minimize2.svg'
import X from '@/assets/x.svg'
import Max from '@/assets/Maximize1.svg'
import UnMax from '@/assets/Maximize2.svg'
import { onMounted, onUnmounted, ref } from 'vue';
import { windowService, ipcService } from '@/services';
import { ImTypes, IpcChannels } from '@/types';

const props = withDefaults(
    defineProps<{
        height?: string
        needMin?: boolean
        needMax?: boolean
        title?: string
        theme?: 'dark' | 'light'
        onClose?: () => void
    }>(),
    {
        height: '35px',
        needMin: true,
        needMax: false,
        title: '',
        theme: 'light',
        onClose: () => {
            // Trigger the App.vue unmount logic locally bypassing main process
            ipcService.emitLocal(IpcChannels.APP_QUIT)
        }
    }
)
const isMax = ref(false)
const wsState = ref(ImTypes.ConnectionState.UNRECOGNIZED)

const onMin = () => {
    windowService.minimize()
}
const onMax = () => {
    windowService.maximize()
}

onMounted(() => {
    windowService.onWindowState((state) => {
        isMax.value = state === 'maximized'
    })
    ipcService.on(IpcChannels.WS_STATE_CHANGE, (e,state) => {
        wsState.value = state
        console.log(state)
    })
})
onUnmounted(() => {
    ipcService.off(IpcChannels.WS_STATE_CHANGE)
})
</script>

<style lang="scss" scoped>
.main-container {
    position: relative;
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
                    background-color: rgba(24, 144, 255, 0.1);
                    color: #1890ff;

                    .spinner {
                        width: 12px;
                        height: 12px;
                        border: 2px solid #1890ff;
                        border-top-color: transparent;
                        border-radius: 50%;
                        animation: spin 1s linear infinite;
                    }
                }

                &.error {
                    background-color: rgba(255, 77, 79, 0.1);
                    color: #ff4d4f;
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
        cursor: pointer;
        transition: all 0.3s ease;
        -webkit-app-region: no-drag;
        pointer-events: auto;
        display: flex;
        align-items: center;
        justify-content: center;

        img {
            width: 50%;
            height: 50%;
            pointer-events: none;
        }
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
    button {
        img {
            filter: invert(1);
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