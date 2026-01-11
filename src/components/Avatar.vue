<template>
    <div class="avatar">
        <img :src="imgSrc" alt="加载失败" class="avatar-img" @error="onError">
    </div>
</template>

<script lang="ts" setup>
import { useRelationStore } from '@/store/relationMap';
import defaultImg from '@/assets/default.png'
import defaultGroupImg from '@/assets/defaultg.png'

const relationStore = useRelationStore();

const props = withDefaults(
    defineProps<{
        type?: string
        uid: string
    }>(),
    { 
        type: 'user'
    }
)

import { ref, watch } from 'vue'
const imgSrc = ref<string>(defaultImg)

// 监听外部传入的source变化，实时更新显示
watch(() => props.uid, (val) => {
  if (props.type === 'user') {
    imgSrc.value = relationStore.getUser(val)?.avatar || ''
  } else {

  }
}, { immediate: true })

const onError = () => {
    console.log('图片加载失败',props.type)
    if (props.type === 'user') {
        imgSrc.value = defaultImg
    } else if (props.type === 'group') {
        imgSrc.value = defaultGroupImg
    }
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