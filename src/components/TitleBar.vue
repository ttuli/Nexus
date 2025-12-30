<template>
    <div class="main-container">
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
import { onMounted, onUnmounted,ref } from 'vue';

const props = withDefaults(
    defineProps<{
        height?: string
        needMin?: boolean
        needMax?:boolean
        onClose?: () => void
    }>(),
    {   
        height: '35px',
        needMin: true,
        needMax: false,
        onClose: () => {
            window.close()
        }
    }
)
const isMax = ref(false)

const onMin = () => {
    window.ipcRenderer.send('window:minimize')
}
const onMax = () => {
    window.ipcRenderer.send('window:maximize')
}

onMounted(() => {
    window.ipcRenderer.on('window:state', (_event, state) => {
        console.log('window:state', state)
        if (state === 'maximized') {
            isMax.value = true
        } else {
            isMax.value = false
        }
    })
})
onUnmounted(() => {
    window.ipcRenderer.removeAllListeners('window:state')
})
</script>

<style lang="scss" scoped>
.main-container {
    position: fixed;
    z-index: 1000;
    top: 0;
    left: 0;
    right: 0;
    width: 100%;
    background-color: transparent;
    height: v-bind(height);
    display: flex;
    justify-content: flex-end;
    pointer-events: none;
    button {
        width: v-bind(height);
        height: v-bind(height);
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
            width: 70%;
            height: 70%;
        }
    }
    .close-btn {
        &:hover {
            background-color: red;
        }
        &:active {
            background-color: #cc0000; // red 变暗 10%
        }
    }
    .max-btn {
        &:hover {
            background-color: rgba(163, 163, 163, 0.305);
        }
        &:active {   
            background-color: rgba(140, 140, 140, 0.305); // 变暗 10%
        }
    }
    .min-btn {
        &:hover {
            background-color: rgba(163, 163, 163, 0.305);
        }
        &:active {
            background-color: rgba(140, 140, 140, 0.305); // 变暗 10%
        }
    }
}
</style>