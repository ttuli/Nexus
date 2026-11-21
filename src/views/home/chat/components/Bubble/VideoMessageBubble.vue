<template>
    <div class="video-message-bubble">
        <!-- 视频外层容器 -->
        <div class="video-wrapper" :style="wrapperStyle" @click="handleClick">
            <!-- 视频主体：仅保留缩略图的展示 -->
            <img v-if="displayThumb" :src="displayThumb" class="video-content" />

            <!-- 播放/下载按钮（仅在不在上传、且没出错时显示） -->
            <div class="action-btn-wrapper" v-show="isFinishing">
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

            <!-- 底部信息栏（悬浮显示） -->
            <div class="video-info-bar">
                <span class="file-name">{{ props.message.fileName || '视频文件' }}</span>
                <span class="duration" v-if="props.message.duration > 0">
                    {{ formatDuration(props.message.duration) }}
                </span>
            </div>

            <!-- 上传/下载进度蒙层 -->
            <MediaProgressMask
                :finished="isFinishing"
                :progress="props.message.uploadProgress || 0"
                :can-cancel="isDownloading || isUploading"
            />
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import MediaProgressMask from './MediaProgressMask.vue';
import { ILocalVideoMessage } from '@shared/types/chatMessage';
import { APP_CONSTANTS as config } from '@shared/config/constants';
import { CacheOptionType, ImTypes } from '@shared/types';
import { openVideoViewer } from '@/src/utils/window';
import { calcMediaWrapperStyle } from '@/src/utils/mediaUtils';
import { formatCallDuration as formatDuration } from '@/src/utils/messageConverter';
import { ElMessage } from 'element-plus';
import { messageService } from '@/src/services/messageService';
import { toResourceUrl } from '@/src/utils/resourceUrl';
import { fileService } from '@/src/services/fileService';
import { cancelUpload } from '@/src/composables/useChatPage';

interface Props {
    message: ILocalVideoMessage;
}

const props = defineProps<Props>();

// 控制下载状态
const isDownloading = ref(false);

// 判断是否处于上传状态
const isUploading = computed(() => {
    return props.message.status === ImTypes.MessageStatus.MESSAGE_STATUS_SENDING 
        && props.message.uploadProgress !== 100;
});

// 控制遮罩显示及无上传进度时的状态
const isFinishing = computed(() => {
    if (isDownloading.value) {
        return false;
    }
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
            const thumbnailUrl = toResourceUrl(msg.url,{
                cacheType: CacheOptionType.VIDEO_THUMB,
                width: msg.thumbnailWidth,
                height: msg.thumbnailHeight,
            })
            if (thumbnailUrl) {
                displayThumb.value = thumbnailUrl;
                msg.thumbnailUrl = thumbnailUrl;
                messageService.saveMessage(msg);
            }
        } catch (e) {
            console.error('[VideoBubble] Failed to get video full url:', e);
        }
    }
}, { immediate: true });

// 动态计算尺寸，如果有宽高信息按比例缩小，没有的话使用占位
const wrapperStyle = computed(() => calcMediaWrapperStyle(props.message, 160));

const handlePlay = async () => {
    if (!(await fileService.checkLocalFileExists(props.message.localPath || ''))) {
        props.message.localPath = '';
        messageService.saveMessage(props.message);
        ElMessage.error('视频文件不存在');
        return;
    }
    console.log('[VideoBubble] 播放视频，本地路径:', props.message.localPath);
    openVideoViewer(toResourceUrl(props.message.localPath!, { cacheType: CacheOptionType.VIDEO }), props.message.width, props.message.height);
};

const currentDownloadAbort = ref<(() => void) | null>(null);

const handleDownload = async () => {
    if (!props.message.url) {
        ElMessage.error('视频地址无效');
        return;
    }
    if (isDownloading.value) return;

    isDownloading.value = true;
    props.message.uploadProgress = 0;

    try {
        const { promise, abort } = await fileService.downloadFile(
            props.message.url, 
            props.message.fileName,
            (progress: number) => {
                props.message.uploadProgress = progress;
            }
        );
        
        currentDownloadAbort.value = abort;
        
        const localPath = await promise;
        props.message.localPath = localPath;
        messageService.saveMessage(props.message);
    } catch (e: any) {
        if (e?.message !== config.ERR_DOWNLOAD_CANCELLED) {
            console.error('[VideoBubble] 下载失败:', e);
            ElMessage.error('视频下载失败');
        }
    } finally {
        currentDownloadAbort.value = null;
        props.message.uploadProgress = undefined;
        isDownloading.value = false;
    }
};

const handleClick = async () => {
    if (!isFinishing.value) {
        if (isDownloading.value) {
            currentDownloadAbort.value?.();
        } else if (isUploading.value) {
            cancelUpload(props.message.clientId || '');
            ElMessage.error("已取消上传")
        }
        return;
    }

    if (props.message.localPath) {
        handlePlay();
    } else {
        await handleDownload();
    }
};
</script>

<style scoped lang="scss">
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
        background-color: transparent;
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
            width: 100%;
            height: 100%;
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

        .video-info-bar {
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            padding: 24px 8px 6px; // 顶部多留点渐变空间使之自然
            background: linear-gradient(to top, rgba(0, 0, 0, 0.4) 0%, transparent 100%);
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            opacity: 0;
            transition: opacity 0.2s ease;
            z-index: 5;
            pointer-events: none;

            .file-name {
                color: #fff;
                font-size: 11px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                margin-right: 10px;
                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3); // 增加文字清晰度
            }

            .duration {
                color: #fff;
                font-size: 11px;
                font-family: monospace;
                flex-shrink: 0;
                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
            }
        }

        &:hover .video-info-bar {
            opacity: 1;
        }
    }
}
</style>
