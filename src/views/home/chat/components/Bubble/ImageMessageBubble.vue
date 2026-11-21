<template>
    <div class="image-message-bubble">
        <div class="image-wrapper" :style="wrapperStyle" @click="handleClick">
            <!-- 图片主体 -->
            <img v-show="imageLoaded" v-if="displayUrl" :src="displayUrl" class="image-content" @error="handleImageError"
                alt="图片消息" @load="imageLoaded = true" />

            <!-- 图片加载过程中的 loading spinner -->
            <div class="image-loading" :class="{ 'shifted': !isFinishing }" v-if="!imageLoaded && !isError">
                <svg class="loading-circular" viewBox="25 25 50 50">
                    <circle cx="50" cy="50" r="20" fill="none" class="path"></circle>
                </svg>
            </div>

            <!-- 上传进度蒙层（复用于自己发送的上传和对方发送的下载） -->
            <MediaProgressMask
                :finished="isFinishing"
                :progress="props.message.uploadProgress || 0"
                :indeterminate="!isSelf"
            />
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import MediaProgressMask from './MediaProgressMask.vue';
import { ILocalImageMessage } from '@shared/types/chatMessage';
import { toResourceUrl } from '@/src/utils/resourceUrl';
import { calcMediaWrapperStyle } from '@/src/utils/mediaUtils';
import { CacheOptionType, ImTypes } from '@shared/types';
import { fileService } from '@/src/services/fileService';
import { openPhotoViewer } from '@/src/utils/window';
import { ElMessage } from 'element-plus';
import { useUserStore } from '@/src/store/user';
import { messageService } from '@/src/services/messageService';

interface Props {
    message: ILocalImageMessage;
}

const props = defineProps<Props>();

const userStore = useUserStore();
const isSelf = computed(() => props.message.fromUserId === userStore.userID);

const isError = ref(false);
const errorRetryCount = ref(0);
const imageLoaded = ref(false);

// 控制遮罩显示及动画退场的状态
const isFinishing = computed(() => {
    if (isSelf.value) {
        return props.message.uploadProgress === 100 || props.message.status !== ImTypes.MessageStatus.MESSAGE_STATUS_SENDING;
    } else {
        return imageLoaded.value;
    }
})

// 实际渲染的 URL，响应式
const displayUrl = ref(props.message.thumbnailUrl || '');

// 监听消息变化，决定 displayUrl 来源
watch(() => props.message, (msg) => {
    if (msg.thumbnailUrl && msg.thumbnailUrl !== '') {
        displayUrl.value = msg.thumbnailUrl;
        return;
    }
    if (msg.localPath && msg.localPath !== '') {
        displayUrl.value = toResourceUrl(msg.localPath, {
            cacheType: CacheOptionType.IMAGE_THUMB,
            width: msg.thumbnailWidth,
            height: msg.thumbnailHeight
        });
        return;
    }
    // 没有本地路径也没有缩略图 URL，异步获取
    if (msg.url) {
        displayUrl.value = toResourceUrl(msg.url, {
            cacheType: CacheOptionType.IMAGE_THUMB,
            width: msg.thumbnailWidth,
            height: msg.thumbnailHeight
        });
        props.message.thumbnailUrl = displayUrl.value;
        messageService.saveMessage(props.message);
    }
}, { immediate: true });

const wrapperStyle = computed(() => calcMediaWrapperStyle(props.message, 120));

const handleImageError = async () => {
    // 重试一次
    if (errorRetryCount.value < 1 && props.message.url) {
        errorRetryCount.value++;
        props.message.thumbnailUrl = '';
    } else {
        isError.value = true;
    }
};

const handleClick = async () => {
    if (isError.value || !isFinishing.value) return;

    const initialSize = props.message.width && props.message.height 
        ? { width: props.message.width, height: props.message.height } 
        : undefined;

    try {
        if (props.message.localPath && await fileService.checkLocalFileExists(props.message.localPath)) {
            await openPhotoViewer([toResourceUrl(props.message.localPath, { cacheType: CacheOptionType.IMAGE })], 0, initialSize);
            return;
        }
        await openPhotoViewer([toResourceUrl(props.message.url,{
            cacheType: CacheOptionType.IMAGE
        })], 0, initialSize);
    } catch (e) {
        ElMessage.error('图片已过期或被清理')
        console.error('[ImageBubble] Failed to open photo viewer:', e);
    }
};
</script>

<style scoped lang="scss">
.image-message-bubble {
    width: 100%;
    height: 100%;

    .image-wrapper {
        position: relative;
        border-radius: 8px;
        overflow: hidden;
        cursor: pointer;
        background-color: $bg-card; // 占位底色
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
            pointer-events: none; // 防止遮挡点击事件
        }

        &:hover::after {
            opacity: 1;
        }

        .image-content {
            display: block;
            width: 100%;
            height: 100%;
            object-fit: cover;
            /* 保证不管容器多大都能撑满且不变形 */
            transition: opacity 0.3s ease;
        }

        .image-loading {
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 5;
            pointer-events: none;
            transition: transform 0.3s ease;

            &.shifted {
                transform: translateY(35px);
            }

            .loading-circular {
                width: 24px;
                height: 24px;
                animation: image-loading-rotate 2s linear infinite;

                .path {
                    stroke: var(--el-color-primary, #409eff);
                    stroke-width: 4;
                    stroke-dasharray: 1, 200;
                    stroke-dashoffset: 0;
                    animation: image-loading-dash 1.5s ease-in-out infinite;
                    stroke-linecap: round;
                }
            }

            @keyframes image-loading-rotate {
                100% {
                    transform: rotate(360deg);
                }
            }

            @keyframes image-loading-dash {
                0% {
                    stroke-dasharray: 1, 200;
                    stroke-dashoffset: 0;
                }
                50% {
                    stroke-dasharray: 90, 200;
                    stroke-dashoffset: -35px;
                }
                100% {
                    stroke-dasharray: 90, 200;
                    stroke-dashoffset: -124px;
                }
            }
        }
    }
}
</style>
