<template>
    <div class="main-container" :class="{ dark: props.theme === 'dark' }">
        <span class="title-content">{{ props.title }}</span>
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
import { onMounted, ref } from 'vue';
import { windowService } from '@/services';

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
            window.close()
        }
    }
)
const isMax = ref(false)

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

    .title-content {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: 16px;
        color: $color-text-primary;
        max-width: 40%;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        text-align: center;
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