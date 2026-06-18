<template>
    <div class="image-message-bubble">
        <!-- eslint-disable-next-line vue/valid-v-else-if -->
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
            <transition name="fade-reveal">
                <div class="upload-mask" :class="{ 'is-finishing': isFinishing }" v-show="!isFinishing">
                    <div class="custom-progress">
                        <svg class="progress-ring" :class="{ 'is-spinning': !isSelf }" width="44" height="44">
                            <!-- 背景环 -->
                            <circle class="ring-bg" stroke="rgba(255,255,255,0.3)" stroke-width="3" fill="transparent"
                                r="18" cx="22" cy="22" />
                            <!-- 进度环 -->
                            <circle class="ring-progress" stroke="#fff" stroke-width="3" fill="transparent"
                                :stroke-dasharray="113"
                                :stroke-dashoffset="isSelf ? (113 - ((props.message.uploadProgress || 0) / 100) * 113) : 85"
                                stroke-linecap="round" r="18" cx="22" cy="22" />
                        </svg>
                        <span class="progress-text" v-if="isSelf">{{ props.message.uploadProgress || 0 }}%</span>
                    </div>
                </div>
            </transition>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { ILocalImageMessage } from '@/src/types/chatMessage';
import { APP_CONSTANTS as config } from '@/src/config/constants';
import { toResourceUrl } from '@/src/utils/chat';
import { CacheOptionType, ImTypes } from '@/src/types';
import { fileService } from '@/src/services/fileService';
import { openPhotoViewer } from '@/src/utils/window';
import { ElMessage } from 'element-plus';
import { useUserStore } from '@/src/store/user';
import { messageStorageService } from '@/src/services/messageStorageService';

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
        messageStorageService.saveMessage(props.message);
    }
}, { immediate: true });

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
        // 限制最大宽高，保持比例
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

    // 没有尺寸信息时给个默认方形占位
    return {
        width: '120px',
        height: '120px'
    };
});

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
@use "@/src/style/_constant.scss" as *;

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

        .upload-mask {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: rgba(0, 0, 0, 0.282);
            display: flex;
            align-items: center;
            justify-content: center;

            // 使用 clip-path 替代 mask-image，因为 clip-path 完美支持 circle 半径的 transition 过渡
            clip-path: circle(100% at center);
            transition: clip-path 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.4s ease;
            z-index: 10; // 确保加载条在悬浮层之上

            .custom-progress {
                position: relative;
                width: 44px;
                height: 44px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: opacity 0.3s ease, transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);

                .progress-ring {
                    transform: rotate(-90deg); // 从顶部开始
                    
                    &.is-spinning {
                        animation: spin 1s linear infinite;
                    }
                    @keyframes spin {
                        from { transform: rotate(-90deg); }
                        to { transform: rotate(270deg); }
                    }

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

            // 当进度完成（或状态终止）时，加入此类
            &.is-finishing {
                opacity: 0;
                // 中心掏空效果通过让 clip-path 缩减为 0 来反向实现（其实圆往外扩散消失直接用 opacity 或者 scale 反转更好）
                // 真正的中心镂空放大非常难用单层 css 实现。这里我们可以通过缩放一个假的背景圆，或者最稳定的就是直接淡出 + 缩放子元素

                .custom-progress {
                    opacity: 0;
                    transform: scale(1.5); // 进度圈变大变淡消失（更有完成感）
                }
            }
        }

        // Vue 过渡动画兜底（防止一上来渲染出问题或非正常消失）
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
