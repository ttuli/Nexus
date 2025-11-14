<template>
    <div class="avatar">
        <img :src="imgSrc" alt="加载失败" class="avatar-img" @error="onError">
    </div>
</template>

<script lang="ts" setup>
import defaultImg from '@/assets/default.png'

const props = withDefaults(
    defineProps<{
        source?: string
    }>(),
    {   
        source: defaultImg
    }
)

import { ref, watch } from 'vue'
const imgSrc = ref<string>(defaultImg)

// 监听外部传入的source变化，实时更新显示
watch(() => props.source, (val) => {
  imgSrc.value = val || defaultImg
}, { immediate: true })

const onError = () => {
    console.log('图片加载失败')
  imgSrc.value = defaultImg
}
</script>

<style lang="scss" scoped>
.avatar {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100%;
    height: 100%;
    .avatar-img {
        width: 100%;
        height: 100%;
        border-radius: 50%;
        object-fit: cover;
        -webkit-app-region: no-drag;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
        transition: transform 0.1s;
        &:hover {
            transform: scale(1.05);
        }
    }
}
</style>