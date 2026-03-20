<template>
    <div class="video-message-bubble">
        <!-- 视频外层容器 -->
        <div class="video-wrapper" :style="wrapperStyle" @click="handleClick">
            <!-- 视频主体：优先显示缩略图，没有缩略图才用 video 去截帧 -->
            <img v-if="displayThumb" :src="displayThumb" class="video-content" @error="handleVideoError" />
            <video v-else-if="displayUrl" :src="displayUrl + '#t=0.1'" class="video-content" preload="metadata"
                @error="handleVideoError" @loadedmetadata="handleLoadedMetadata" muted playsinline></video>

            <!-- 播放按钮（仅在不在上传、不在下载、且没出错时显示） -->
            <div class="play-btn-wrapper" v-show="isFinishing && !isError">
                <div class="play-btn">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                        <path d="M8 5v14l11-7z" />
                    </svg>
                </div>
            </div>

            <!-- 时间角标 -->
            <div class="duration-badge" v-if="props.message.duration > 0">
                {{ formatDuration(props.message.duration) }}
            </div>

            <!-- 上传进度蒙层（仅对自己发送且处于上传状态的消息显示） -->
            <transition name="fade-reveal">
                <div class="upload-mask" :class="{ 'is-finishing': isFinishing }" v-show="!isFinishing">
                    <div class="custom-progress">
                        <svg class="progress-ring" width="44" height="44">
                            <!-- 背景环 -->
                            <circle class="ring-bg" stroke="rgba(255,255,255,0.3)" stroke-width="3" fill="transparent"
                                r="18" cx="22" cy="22" />
                            <!-- 进度环 -->
                            <circle class="ring-progress" stroke="#fff" stroke-width="3" fill="transparent"
                                :stroke-dasharray="113"
                                :stroke-dashoffset="113 - ((props.message.uploadProgress || 0) / 100) * 113"
                                stroke-linecap="round" r="18" cx="22" cy="22" />
                        </svg>
                        <span class="progress-text">{{ props.message.uploadProgress || 0 }}%</span>
                    </div>
                </div>
            </transition>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { ILocalVideoMessage } from '@/types/chatMessage';
import { config } from '@/config';
import { ImTypes } from '@/types';
import { fileService } from '@/services/fileService';
import { openVideoViewer } from '@/utils/window';
import { ElMessage } from 'element-plus';
import { chatService } from '@/services';
import { toNetworkPreviewUrl } from '@/utils/chat';
import { ms } from 'element-plus/es/locale/index.mjs';

interface Props {
    message: ILocalVideoMessage;
}

const props = defineProps<Props>();

const isError = ref(false);
const videoWidth = ref(0);
const videoHeight = ref(0);

// 控制遮罩显示及无上传进度时的状态
const isFinishing = computed(() => {
    return props.message.uploadProgress === 100 || props.message.status !== ImTypes.MessageStatus.MESSAGE_STATUS_SENDING;
});

// 视频播放地址
const displayUrl = ref('');
// 封面缩略图地址（Base64 或 OSS 截帧地址）
const displayThumb = ref('');

watch(() => props.message, async (msg) => {
    // 优先使用传入的 thumbnailUrl（发送方的首帧 Base64）
    if (msg.thumbnailUrl && msg.thumbnailUrl !== '') {
        displayThumb.value = msg.thumbnailUrl;
        return;
    }
    console.log('VideoMessageBubble message changed:', msg);
    
    // 如果有远端 url，则获取签名/完整访问地址
    if (msg.url) {
        try {
            // 使用 getFileUrl 获取视频的 OSS 播放/下载地址
            const fullUrl = await fileService.getFileUrl(msg.url); 
            if (fullUrl !== '') {
                displayUrl.value = fullUrl;
                
                if (!displayThumb.value) {
                    const thumbUrl = await fileService.getFileUrl(msg.url, 'video/snapshot,t_0,f_jpg');
                    if (thumbUrl) {
                        msg.thumbnailUrl = toNetworkPreviewUrl(thumbUrl);
                        displayThumb.value = msg.thumbnailUrl;
                        chatService.saveMessage(msg);
                    }
                }
            } else {
                isError.value = true;
            }
        } catch (e) {
            console.error('[VideoBubble] Failed to get video full url:', e);
            isError.value = true;
        }
    }
}, { immediate: true });

// 通过监听 loadedmetadata 拿到视频的原生比例，如果消息结构里没有带宽高的话
const handleLoadedMetadata = (e: Event) => {
    const target = e.target as HTMLVideoElement;
    videoWidth.value = target.videoWidth;
    videoHeight.value = target.videoHeight;
};

// 动态计算尺寸，如果有宽高信息按比例缩小，没有的话等待 loadedmetadata 或使用占位
const wrapperStyle = computed(() => {
    let width = props.message.width || videoWidth.value || 0;
    let height = props.message.height || videoHeight.value || 0;

    if (width > 0 && height > 0) {
        // 限制最大宽高，保持比例（复用图片的最大尺寸配置）
        if (width > config.message.image.max_width || height > config.message.image.max_height) {
            const ratio = Math.min(config.message.image.max_width / width, config.message.image.max_height / height);
            width = width * ratio;
            height = height * ratio;
        }
        // 限制最小宽高
        width = Math.max(width, config.message.image.min_size);
        height = Math.max(height, config.message.image.min_size);

        return {
            width: `${width}px`,
            height: `${height}px`
        };
    }

    // 没有尺寸信息时采用默认占位，16:9 接近的默认大小
    return {
        width: '160px',
        height: '160px'
    };
});

const handleVideoError = async () => {
    console.error('[VideoBubble] video-load-error');
    isError.value = true;
};

const handleClick = async () => {
    if (isError.value || !isFinishing.value) return;

    try {
        if (props.message.localPath && await fileService.checkLocalFileExists(props.message.localPath)) {
            openVideoViewer(
                props.message.localPath,
                props.message.width,
                props.message.height
            );
            console.log('localPath', props.message.localPath);
            return;
        }

        const fullUrl = await fileService.getFileUrl(props.message.url);
        if (fullUrl !== '') {
            openVideoViewer(fullUrl, props.message.width, props.message.height);
        } else {
            ElMessage.error('视频已过期或无法访问');
        }
    } catch (e) {
        ElMessage.error('视频已过期或无法访问');
        console.error('[VideoBubble] Failed to open viewer:', e);
    }
};

const formatDuration = (seconds: number) => {
    if (!seconds) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
};
</script>

<style scoped lang="scss">
@use "@/style/_constant.scss" as *;

.video-message-bubble {
    width: 100%;
    height: 100%;

    .video-wrapper {
        width: 100%;
        height: 100%;
        position: relative;
        border-radius: 8px;
        overflow: hidden;
        cursor: pointer;
        background-color: #000; // 视频底部黑边用纯黑比较合适
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
        display: flex;
        align-items: center;
        justify-content: center;

        // 鼠标悬浮时的透明黑幕
        &::after {
            content: '';
            position: absolute;
            inset: 0;
            background-color: rgba(0, 0, 0, 0.15);
            opacity: 0;
            transition: opacity 0.2s ease;
            pointer-events: none;
        }

        &:hover::after {
            opacity: 1;
        }

        .video-content {
            display: block;
            width: 100%;
            height: 100%;
            object-fit: cover;
            transition: opacity 0.3s ease;
            pointer-events: none; // 禁止用户在气泡中交互原生的视频控件
        }

        .play-btn-wrapper {
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 5;
            pointer-events: none;

            .play-btn {
                width: 40px;
                height: 40px;
                border-radius: 50%;
                background-color: rgba(0, 0, 0, 0.5);
                color: rgba(255, 255, 255, 0.9);
                display: flex;
                align-items: center;
                justify-content: center;
                backdrop-filter: blur(2px);
                transition: transform 0.2s, background-color 0.2s;

                svg {
                    margin-left: 2px; // 光学居中调整
                }
            }
        }

        &:hover .play-btn {
            background-color: rgba(0, 0, 0, 0.7);
            transform: scale(1.1);
        }

        .duration-badge {
            position: absolute;
            bottom: 6px;
            right: 8px;
            background-color: rgba(0, 0, 0, 0.6);
            color: white;
            padding: 2px 6px;
            border-radius: 10px;
            font-size: 11px;
            font-family: monospace;
            z-index: 5;
            pointer-events: none;
        }

        .upload-mask {
            position: absolute;
            inset: 0;
            background-color: rgba(0, 0, 0, 0.282);
            display: flex;
            align-items: center;
            justify-content: center;
            clip-path: circle(100% at center);
            transition: clip-path 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.4s ease;
            z-index: 10;

            .custom-progress {
                position: relative;
                width: 44px;
                height: 44px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: opacity 0.3s ease, transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);

                .progress-ring {
                    transform: rotate(-90deg);

                    circle {
                        transition: stroke-dashoffset 0.2s linear;
                    }
                }

                .progress-text {
                    position: absolute;
                    font-size: 11px;
                    color: #fff;
                    font-weight: 500;
                    font-family: monospace;
                }
            }

            &.is-finishing {
                opacity: 0;

                .custom-progress {
                    opacity: 0;
                    transform: scale(1.5);
                }
            }
        }

        .fade-reveal-enter-active,
        .fade-reveal-leave-active {
            transition: opacity 0.4s;
        }

        .fade-reveal-enter-from,
        .fade-reveal-leave-to {
            opacity: 0;
        }
    }
}
</style>
