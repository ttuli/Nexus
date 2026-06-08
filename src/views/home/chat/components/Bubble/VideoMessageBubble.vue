<template>
    <div class="video-message-bubble">
        <!-- 视频外层容器 -->
        <div class="video-wrapper" :style="wrapperStyle" @click="handleClick">
            <!-- 视频主体：仅保留缩略图的展示 -->
            <img v-if="displayThumb" :src="displayThumb" class="video-content" @error="handleVideoError" />

            <!-- 播放/下载按钮（仅在不在上传、且没出错时显示） -->
            <div class="action-btn-wrapper" v-show="isFinishing && !isError">
                <!-- 有 localPath 显示播放按钮 -->
                <div v-if="props.message.localPath" class="play-btn">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                        <path d="M8 5v14l11-7z" />
                    </svg>
                </div>
                <!-- 没有 localPath 显示下载按钮 -->
                <div v-else class="download-btn">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                        <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z" />
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
import { APP_CONSTANTS as config } from '@/config/constants';
import { ImTypes } from '@/types';
import { fileService } from '@/services/fileService';
import { openVideoViewer } from '@/utils/window';
import { ElMessage } from 'element-plus';
import { messageStorageService } from '@/services/messageStorageService';
import { downloadMessageToLocal, toNetworkPreviewUrl } from '@/utils/chat';

interface Props {
    message: ILocalVideoMessage;
}

const props = defineProps<Props>();

const isError = ref(false);

// 控制遮罩显示及无上传进度时的状态
const isFinishing = computed(() => {
    return props.message.uploadProgress === 100 || props.message.status !== ImTypes.MessageStatus.MESSAGE_STATUS_SENDING;
});

// 封面缩略图地址（Base64 或 OSS 截帧地址）
const displayThumb = ref('');

watch(() => props.message, async (msg) => {
    // 优先使用传入的 thumbnailUrl（发送方的首帧 Base64）
    if (msg.thumbnailUrl && msg.thumbnailUrl !== '') {
        displayThumb.value = msg.thumbnailUrl;
        return;
    }
    
    // 如果有远端 url，则获取签名/完整访问地址
    if (msg.url) {
        try {
            const thumbUrl = await fileService.getFileUrl(msg.url, 'video/snapshot,t_0,f_jpg');
            if (thumbUrl) {
                msg.thumbnailUrl = toNetworkPreviewUrl(thumbUrl);
                displayThumb.value = msg.thumbnailUrl;
                messageStorageService.saveMessage(msg);
            } else {
                isError.value = true;
            }
        } catch (e) {
            console.error('[VideoBubble] Failed to get video full url:', e);
            isError.value = true;
        }
    }
}, { immediate: true });

// 动态计算尺寸，如果有宽高信息按比例缩小，没有的话使用占位
const wrapperStyle = computed(() => {
    // 优先使用明确提供的缩略图尺寸
    if (props.message.thumbnailWidth && props.message.thumbnailHeight && props.message.thumbnailWidth > 0 && props.message.thumbnailHeight > 0) {
        return {
            width: `${props.message.thumbnailWidth}px`,
            height: `${props.message.thumbnailHeight}px`
        };
    }

    let width = props.message.width || 0;
    let height = props.message.height || 0;

    if (width > 0 && height > 0) {
        // 限制最大宽高，保持比例（复用图片的最大尺寸配置）
        if (width > config.maxImageWidth || height > config.maxImageHeight) {
            const ratio = Math.min(config.maxImageWidth / width, config.maxImageHeight / height);
            width = width * ratio;
            height = height * ratio;
        }

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

const handlePlay = () => {
    console.log('[VideoBubble] 播放视频，本地路径:', props.message.localPath);
    // TODO: 播放逻辑占位
};

const handleDownload = async () => {
    console.log('[VideoBubble] 开始下载视频:', props.message.url);
    // TODO: 下载逻辑占位
    // 模拟下载成功并更新 localPath
    try {
        await new Promise(resolve => setTimeout(resolve, 1500)); // 模拟网络延迟
        props.message.localPath = 'mock/local/path/video.mp4';
        messageStorageService.saveMessage(props.message);
        ElMessage.success('视频下载成功(模拟)');
    } catch (e) {
        console.error('[VideoBubble] 下载失败:', e);
        ElMessage.error('视频下载失败(模拟)');
    }
};

const handleClick = async () => {
    if (isError.value || !isFinishing.value) return;

    if (props.message.localPath) {
        handlePlay();
    } else {
        await handleDownload();
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

        .action-btn-wrapper {
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 5;
            pointer-events: none;

            .play-btn, .download-btn {
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
            }

            .play-btn svg {
                margin-left: 2px; // 光学居中调整
            }
        }

        &:hover .play-btn, &:hover .download-btn {
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
