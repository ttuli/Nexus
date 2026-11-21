<template>
    <div class="video-viewer">
        <TitleBar class="title-bar" :title="currentTitle" :need-max="true" theme="dark" />
        <div class="video-container">
            <video
                v-if="currentUrl && !errorMsg"
                :src="currentUrl"
                controls
                autoplay
                :muted="false"
                class="viewer-video"
                @error="handleVideoError"
            ></video>
            
            <div v-if="errorMsg" class="error-overlay">
                <div class="error-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                </div>
                <div class="error-text">{{ errorMsg }}</div>
                <div class="error-subtext">无法播放该视频文件，请检查文件是否存在或格式是否支持</div>
                <div class="error-url" v-if="currentUrl">URL: {{ currentUrl }}</div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { signalWindowReady } from '@/src/utils/window';

const route = useRoute();
const currentUrl = ref('');
const errorMsg = ref('');

const handleVideoError = (event: any) => {
    const videoElement = event.target as HTMLVideoElement;
    const error = videoElement.error;
    
    console.error('[VideoViewer] Video Error:', error);
    
    if (error) {
        switch (error.code) {
            case 1: // MEDIA_ERR_ABORTED
                errorMsg.value = '播放被终止';
                break;
            case 2: // MEDIA_ERR_NETWORK
                errorMsg.value = '网络错误，视频检索失败';
                break;
            case 3: // MEDIA_ERR_DECODE
                errorMsg.value = '视频解码错误，文件可能损坏';
                break;
            case 4: // MEDIA_ERR_SRC_NOT_SUPPORTED
                errorMsg.value = '不支持该视频格式或协议，或者文件不存在';
                break;
            default:
                errorMsg.value = `未知播放错误 (代码: ${error.code})`;
                break;
        }
        
        if (error.message) {
            errorMsg.value += `: ${error.message}`;
        }
    } else {
        errorMsg.value = '无法加载视频';
    }
};

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
        // 非标准 URL 兜底
    }
    
    const name = url.split('/').pop() || 'Video';
    return `视频播放 - ${name}`;
});

onMounted(() => {
    const queryUrl = route.query.url as string;
    if (queryUrl) {
        currentUrl.value = queryUrl;
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

        .error-overlay {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            color: #ffffff;
            text-align: center;
            padding: 20px;

            .error-icon {
                width: 48px;
                height: 48px;
                color: #ff4d4f;
                margin-bottom: 20px;
            }

            .error-text {
                font-size: 18px;
                font-weight: 500;
                margin-bottom: 8px;
            }

            .error-subtext {
                font-size: 14px;
                color: #999999;
                margin-bottom: 16px;
            }

            .error-url {
                font-size: 12px;
                color: #666666;
                word-break: break-all;
                max-width: 80%;
                font-family: monospace;
            }
        }
    }
}
</style>
