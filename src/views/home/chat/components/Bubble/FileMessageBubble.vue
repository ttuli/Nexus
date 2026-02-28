<template>
    <div class="file-message-bubble" @click="handleClick">
        <div class="file-icon-wrapper">
            <svg class="file-icon" viewBox="0 0 24 24" width="40" height="40">
                <path :fill="props.isSelf ? '#fff' : '#409eff'"
                    d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
            </svg>

            <!-- Upload progress mask -->
            <transition name="fade-reveal">
                <div class="upload-mask" :class="{ 'is-finishing': isFinishing }" v-show="!isFinishing">
                    <div class="custom-progress">
                        <svg class="progress-ring" width="36" height="36">
                            <!-- Background ring -->
                            <circle class="ring-bg" stroke="rgba(0,0,0,0.1)" stroke-width="2" fill="transparent" r="14"
                                cx="18" cy="18" />
                            <!-- Progress ring -->
                            <circle class="ring-progress" :stroke="props.isSelf ? '#fff' : '#409eff'" stroke-width="2"
                                fill="transparent" :stroke-dasharray="88"
                                :stroke-dashoffset="88 - ((props.message.uploadProgress || 0) / 100) * 88"
                                stroke-linecap="round" r="14" cx="18" cy="18" />
                        </svg>
                    </div>
                </div>
            </transition>
        </div>

        <div class="file-info">
            <div class="file-name" :title="props.message.fileName">{{ props.message.fileName }}</div>
            <div class="file-size" :style="{ color: props.isSelf ? 'rgba(255, 255, 255, 0.8)' : '' }">{{
                formatSize(props.message.size) }}</div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ILocalFileMessage } from '@/types/chatMessage';
import { ImTypes } from '@/types';
import { fileService } from '@/services/fileService';

interface Props {
    message: ILocalFileMessage;
    isSelf: boolean;
}

const props = defineProps<Props>();

const isFinishing = computed(() => {
    return props.message.uploadProgress === 100 || props.message.status !== ImTypes.MessageStatus.MESSAGE_STATUS_SENDING;
});

const formatSize = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const handleClick = async () => {
    // Prevent clicking while still uploading
    if (!isFinishing.value) return;

    if (props.message.localPath) {
        console.log('Open local file', props.message.localPath);
    }

    if (props.message.url) {
        try {
            const downloadUrl = await fileService.getFileUrl(props.message.url);
            if (downloadUrl) {
                const link = document.createElement('a');
                link.href = downloadUrl;
                link.download = props.message.fileName;
                link.target = '_blank';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
        } catch (e) {
            console.error('[FileBubble] Failed to get download url:', e);
        }
    }
};
</script>

<style scoped lang="scss">
@use "@/style/_constant.scss" as *;

.file-message-bubble {
    display: flex;
    align-items: center;
    width: 200px;
    /* Base width, padding adds to this */
    cursor: pointer;
    box-sizing: border-box;
    gap: 12px;

    .file-icon-wrapper {
        position: relative;
        width: 40px;
        height: 40px;
        flex-shrink: 0;

        .file-icon {
            display: block;
        }

        .upload-mask {
            position: absolute;
            inset: 0;
            background-color: rgba(255, 255, 255, 0.3);
            /* Softer mask for both self and other */
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 4px;

            .custom-progress {
                position: relative;
                width: 36px;
                height: 36px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: opacity 0.3s ease, transform 0.3s;

                .progress-ring {
                    transform: rotate(-90deg);

                    circle {
                        transition: stroke-dashoffset 0.2s linear;
                    }
                }
            }

            &.is-finishing {
                opacity: 0;
                pointer-events: none;

                .custom-progress {
                    transform: scale(1.2);
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

    .file-info {
        flex: 1;
        min-width: 0; // For text-overflow
        display: flex;
        flex-direction: column;
        justify-content: center;
        text-align: left;

        .file-name {
            font-size: 14px;
            /* Remove fixed color to inherit from parent */
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            margin-bottom: 4px;
            font-weight: 500;
        }

        .file-size {
            font-size: 12px;
            color: $color-text-secondary;
            /* Inherited or inline-styled depending on isSelf */
        }
    }
}
</style>
