<template>
    <div class="image-message-bubble">
        <!-- eslint-disable-next-line vue/valid-v-else-if -->
        <div class="image-wrapper" :style="wrapperStyle" @click="handleClick">
            <!-- 图片主体 -->
            <img v-if="displayUrl" :src="displayUrl" class="image-content" @error="handleImageError" alt="图片消息" />

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
import { ref, computed } from 'vue';
import { ILocalImageMessage } from '@/types/chatMessage';
import { config } from '@/config';
import { toNetworkPreviewUrl } from '@/utils/chat';

interface Props {
    message: ILocalImageMessage;
}

const props = defineProps<Props>();

const isError = ref(false);

// 控制遮罩显示及动画退场的状态
const isFinishing = computed(() => {
    return props.message.uploadProgress === 100;
})

// 计算实际用来渲染的 URL：有本地路径优先用本地（发送方体验好），没有就用 OSS 的 thumbnailUrl，最后用原图 url
const displayUrl = computed(() => {
    const m = props.message;
    if (m.localPath && m.localPath !== '') return m.localPath;

    // 如果没有本地路径，就走 imcache 缓存加载网络大图（顺带传递原本记录的宽高校验或压缩）
    if (m.thumbnailUrl && m.thumbnailUrl !== '') {
        return m.thumbnailUrl
    }
    m.thumbnailUrl = toNetworkPreviewUrl(m.url, m.width, m.height);
    return m.thumbnailUrl;
});

// 如果后端或者本地已经有了宽高，直接在图片还没加载时撑开占位符，避免气泡闪烁
const wrapperStyle = computed(() => {
    let width = props.message.width || 0;
    let height = props.message.height || 0;

    if (width > 0 && height > 0) {
        // 限制最大宽高，保持比例
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

    // 没有尺寸信息时给个默认方形占位
    return {
        width: '120px',
        height: '120px'
    };
});

const handleImageError = () => {
    console.log("image-load-error")
    isError.value = true;
};

const handleClick = () => {

}
</script>

<style scoped lang="scss">
@use "@/style/_constant.scss" as *;

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
