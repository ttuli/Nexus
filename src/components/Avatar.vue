<template>
    <div class="avatar" @click="handleClick">
        <img :src="getSrc()" alt="加载失败" class="avatar-img">
    </div>
</template>

<script lang="ts" setup>
import defaultImg from '@/assets/default.png'
import defaultGroupImg from '@/assets/defaultg.png'

const props = withDefaults(
    defineProps<{
        type?: string
        uid: number
        radius?: string
        width?: string
        height?: string
    }>(),
    {
        type: 'user',
        radius: '50%',
        width: '40px',
        height: '40px',
    }
)

import { onMounted, ref } from 'vue'
import { userService, groupService } from '@/services'
import { createWindow } from '@/utils/window'
import { useUserStore } from '@/store/user';
import { useGroupStore } from '@/store/group';

const source = ref<string>('')
const userStore = useUserStore();
const groupStore = useGroupStore();

/**
 * 解析尺寸字符串为数字（如 '40px' -> 40）
 */
const parseDimension = (dim: string): number => {
    const match = dim.match(/^(\d+(?:\.\d+)?)/);
    return match ? Math.ceil(parseFloat(match[1])) : 40;
}

/**
 * 为 OSS URL 添加图片缩放参数
 * 使用 2x 尺寸以支持高清屏
 */
const appendOssResize = (url: string): string => {
    if (!url || url.startsWith('data:') || url.startsWith('blob:')) {
        return url;
    }

    const w = parseDimension(props.width) * 2;
    const h = parseDimension(props.height) * 2;
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}x-oss-process=image/resize,w_${w},h_${h}`;
}

const getSrc = () => {
    let url = '';
    if (props.type === 'user') {
        url = userStore.getUser(props.uid)?.avatar || '';
    } else {
        url = groupStore.getGroup(props.uid)?.avatar || '';
    }
    if (!url) {
        url = (props.type === 'user' ? defaultImg : defaultGroupImg)
        source.value = url
        return url;
    }
    source.value = url
    return appendOssResize(url);
}

const handleClick = () => {
    if (!source.value) return;

    // For now pass just this avatar as single item
    // In future could pass context list
    createWindow('photoViewer', {
        urls: [source.value],
        index: 0
    });
}

onMounted(async () => {
    if (props.type === 'user') {
        await userService.fetchByIds([props.uid])
    } else {
        await groupService.fetchByIds([props.uid])
    }
})
</script>

<style lang="scss" scoped>
.avatar {
    display: flex;
    justify-content: center;
    align-items: center;
    width: v-bind(width);
    height: v-bind(height);
    cursor: pointer;

    .avatar-img {
        width: 100%;
        height: 100%;
        border-radius: v-bind(radius);
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