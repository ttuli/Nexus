<template>
    <div class="avatar" @click="handleClick">
        <img :src="getSrc()" alt="加载失败" class="avatar-img" @error="handleError">
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
import { openPhotoViewer } from '@/utils/window'
import { useUserStore } from '@/store/user';
import { useGroupStore } from '@/store/group';

const source = ref<string>('')
const userStore = useUserStore();
const groupStore = useGroupStore();

/**
 * 解析尺寸字符串为数字（如 '40px' -> 40）
 */

/**
 * 将网络 URL 转换为 imcache:// 协议地址
 * 主进程拦截该协议：本地有缓存则直接返回磁盘文件，否则 fallback 到原网络地址
 */
const toImcacheUrl = (url: string): string => {
    if (!url || url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('imcache://')) {
        return url;
    }
    const encoded = btoa(unescape(encodeURIComponent(url)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `imcache://${encoded}`;
}

const getSrc = () => {
    let url = '';
    if (props.type === 'user') {
        url = userStore.getUser(props.uid)?.avatar || '';
    } else {
        url = groupStore.getGroup(props.uid)?.avatar || '';
    }
    if (!url) {
        url = (props.type === 'user' ? defaultImg : defaultGroupImg);
        source.value = url;
        return url;
    }
    source.value = url;
    // 通过 imcache:// 协议渲染：命中本地缓存时秒出，否则由主进程 fallback 到网络图
    return toImcacheUrl(url);
}

const handleError = (e: Event) => {
    const target = e.target as HTMLImageElement;
    target.src = props.type === 'user' ? defaultImg : defaultGroupImg;
}

const handleClick = () => {
    if (!source.value) return;
    openPhotoViewer([source.value], 0);
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