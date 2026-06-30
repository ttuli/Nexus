<template>
    <div class="avatar" @click="handleClick">
        <img :src="getSrc()" alt="加载失败" class="avatar-img" @error="handleError">
    </div>
</template>

<script lang="ts" setup>
import defaultImg from '@/src/assets/avatar/default.png'
import defaultGroupImg from '@/src/assets/avatar/defaultg.png'

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
import { userService, groupService } from '@/src/services'
import { openPhotoViewer } from '@/src/utils/window'
import { useUserStore } from '@/src/store/user';
import { useGroupStore } from '@/src/store/group';
import { toResourceUrl } from '@/src/utils/resourceUrl';
import { CacheOptionType } from '../types';

const source = ref<string>('')
const userStore = useUserStore();
const groupStore = useGroupStore();


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
    return toResourceUrl(url, {
        cacheType: CacheOptionType.AVATAR
    });
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
        if (!userStore.getUser(props.uid)) {
            await userService.fetchByIds([props.uid])
        }
    } else {
        if (!groupStore.getGroup(props.uid)) {
            await groupService.fetchByIds([props.uid])
        }
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