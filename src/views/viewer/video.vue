<template>
    <div class="video-viewer">
        <TitleBar class="title-bar" :title="currentTitle" :need-max="true" theme="dark" />
        <div class="video-container">
            <video
                v-if="currentUrl"
                :src="currentUrl"
                controls
                autoplay
                :muted="false"
                class="viewer-video"
            ></video>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { signalWindowReady } from '@/utils/windowReady';

const route = useRoute();
const urls = ref<string[]>([]);
const currentIndex = ref(0);

const currentUrl = computed(() => urls.value[currentIndex.value] || '');
const currentTitle = computed(() => {
    const url = currentUrl.value;
    if (!url) return 'Video Player';
    
    // 尝试从 URL 中解析文件名
    try {
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/');
        let name = pathParts[pathParts.length - 1];
        if (name) {
            name = decodeURIComponent(name);
            return `视频播放 - ${name}`;
        }
    } catch (e) {
        // 如果不是标准 URL，简单处理
    }
    
    const name = url.split('/').pop() || 'Video';
    return `视频播放 - ${name}`;
});

onMounted(() => {
    const queryUrl = route.query.url as string;
    const queryIndex = route.query.index as string;
    
    // 如果直接传了 url 参数（兼容 openVideoViewer 的调用方式）
    if (queryUrl) {
        // 将单个 url 转为数组以复用后续逻辑
        urls.value = [queryUrl];
        currentIndex.value = 0;
    } 

    if (queryIndex) {
        currentIndex.value = parseInt(queryIndex) || 0;
    }

    signalWindowReady();
});
</script>

<style scoped lang="scss">
.video-viewer {
    width: 100%;
    height: 100vh;
    background-color: #000000;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
    user-select: none;

    .title-bar {
        z-index: 100;
        width: 100%;
        background-color: #1E1E1E;
        // 如果想让它悬浮在视频上方，可以去掉注释：
        // position: absolute;
        // top: 0;
        // left: 0;
    }

    .video-container {
        flex: 1;
        width: 100%;
        height: 100%; // 取决于是否绝对定位 title-bar
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: #000000;
        -webkit-app-region: no-drag;

        .viewer-video {
            width: 100%;
            height: 100%;
            outline: none;
        }
    }
}
</style>
