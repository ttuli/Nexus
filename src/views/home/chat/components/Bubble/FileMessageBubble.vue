<template>
    <div class="file-message-bubble" :class="{ 'is-self': props.isSelf }" @click="handleClick">
        <div class="file-content-main">
            <div class="file-icon-wrapper">
                <!-- SVG 背景绘制带有真实阴影和边框的折角文件形状 -->
                <svg class="file-bg-shape" viewBox="0 0 45 56" preserveAspectRatio="none">
                    <!-- 整个文档投影（使用 drop-shadow） -->
                    <filter id="doc-shadow" x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="rgba(0,0,0,0.1)" />
                    </filter>
                    <g filter="url(#doc-shadow)">
                        <!-- 文档的主体部分 (右上方切角) -->
                        <path d="M 2 2 L 33 2 L 43 12 L 43 54 L 2 54 Z" fill="#ffffff" stroke="#cbcbcb" stroke-width="1"
                            stroke-linejoin="round" />
                        <!-- 右上角的折角 -->
                        <path d="M 33 2 L 33 12 L 43 12 Z" fill="#f0f0f0" stroke="#cbcbcb" stroke-width="1"
                            stroke-linejoin="round" />
                    </g>
                </svg>
                <div class="file-ext" :style="{ backgroundColor: fileIconColor }">{{ fileExtension }}</div>
            </div>
            <div class="file-info-area">
                <div class="file-name" :title="props.message.fileName">{{ props.message.fileName }}</div>

                <!-- 文件大小和状态展示区 -->
                <div class="file-status-info">
                    <div class="size-and-status-text">
                        <span class="file-size">{{ currentSizeStr }}/{{ formatSize(props.message.size) }}</span>
                        <div class="status-indicator">
                            <template v-if="showProgress">
                                <span class="status-text">{{ progressText }}</span>
                                <span class="status-percent">{{ progressPercent }}%</span>
                            </template>
                            <template v-else>
                                <span v-if="props.isSelf" :class="[isFailed ? 'failed-status' : 'success-status']">
                                    {{ isFailed ? '发送失败' : '发送成功' }}
                                </span>
                                <span v-else :class="[isDownloaded ? 'downloaded-status' : 'undownloaded-status']">
                                    <svg v-if="isDownloaded" viewBox="0 0 24 24" width="14" height="14">
                                        <path fill="currentColor"
                                            d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                                    </svg>
                                    {{ isDownloaded ? '已接收' : '未下载' }}
                                </span>
                            </template>
                        </div>
                    </div>

                    <!-- 上传/下载进度条 -->
                    <div v-if="showProgress" class="progress-bar-bg">
                        <div class="progress-bar-fill" :style="{ width: progressPercent + '%' }"></div>
                    </div>
                </div>
            </div>
        </div>

        <!-- 底部操作按钮区域 -->
        <div class="file-action-bar" v-if="showActionBar" @click.stop="handleActionClick">
            <div class="action-btn" :class="{ 'btn-cancel': showProgress }">
                {{ actionText }}
                <svg v-if="actionIcon === 'download'" class="action-icon" viewBox="0 0 24 24" width="16" height="16">
                    <path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
                </svg>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ILocalFileMessage } from '@/src/types/chatMessage';
import { fileService } from '@/src/services/fileService';
import { settingService } from '@/src/services/settingService';
import { websocketService } from '@/src/services/websocketService';
import { ElMessage } from 'element-plus';
import { ImTypes } from '@/src/types';
import { useChatStore } from '@/src/store/chat';

interface Props {
    message: ILocalFileMessage;
    isSelf: boolean;
}

const props = defineProps<Props>();

// --- 状态与文本计算 ---
const chatStore = useChatStore();
const isFailed = computed(() => props.message.status === ImTypes.MessageStatus.MESSAGE_STATUS_FAILED);

const isUploading = computed(() => {
    if (isFailed.value)
        return false;
    return props.isSelf && props.message.uploadProgress !== 100
});

// 本地下载状态
const isDownloading = ref(false);
const downloadProgress = ref(0);
const currentDownloadAbort = ref<(() => void) | null>(null);
// 是否已下载 (based on localPath 字段)
const isDownloaded = computed(() => !!props.message.localPath);

const showProgress = computed(() => {
    return isUploading.value || isDownloading.value;
});

const progressText = computed(() => {
    if (isUploading.value) return '上传中...';
    if (isDownloading.value) return '下载中...';
    return '';
});

const progressPercent = computed(() => {
    if (isUploading.value) return Math.round(props.message.uploadProgress || 0);
    if (isDownloading.value) return Math.round(downloadProgress.value);
    return 0;
});

const currentSizeStr = computed(() => {
    const total = props.message.size || 0;
    if (!showProgress.value) return formatSize(total);
    const current = total * (progressPercent.value / 100);
    return formatSize(current);
});

// 操作栏显示逻辑
const showActionBar = computed(() => {
    // 自己的消息，如果在上传，显示取消
    if (props.isSelf && isUploading.value) return true;

    // 别人的消息：未下载显示下载，下载中显示取消，已下载显示打开
    if (!props.isSelf) {
        return true;
    }
    return false;
});

const actionText = computed(() => {
    if (showProgress.value) return '取消';
    if (!props.isSelf) {
        return isDownloaded.value ? '打开' : '下载';
    }
    return '';
});

const actionIcon = computed(() => {
    if (!props.isSelf && !isDownloaded.value && !showProgress.value) return 'download';
    return '';
});

// --- 文件类型样式 ---
const fileExtension = computed(() => {
    const parts = props.message.fileName?.split('.') || [];
    if (parts.length > 1) {
        return parts[parts.length - 1].toUpperCase().substring(0, 4);
    }
    return 'FILE';
});

const fileIconColor = computed(() => {
    const ext = fileExtension.value.toLowerCase();
    const colorMap: Record<string, string> = {
        'pdf': '#e94242',
        'doc': '#4285f4',
        'docx': '#4285f4',
        'xls': '#0f9d58',
        'xlsx': '#0f9d58',
        'ppt': '#db4437',
        'pptx': '#db4437',
        'zip': '#4285f4',
        'rar': '#4285f4',
        'txt': '#757575',
    };
    return colorMap[ext] || '#9e9e9e';
});

// --- 工具方法 ---
const formatSize = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    let val = parseFloat((bytes / Math.pow(k, i)).toFixed(1));
    return val + ' ' + sizes[i];
};

// --- 事件处理 ---
const handleClick = async () => {
    if (showProgress.value) return; // 进度中点击无效 (操作通过下方按钮)

    // 已发送成功或已下载，点击空白处默认触发下载/打开
    if (!props.isSelf && !isDownloaded.value) {
        startDownload();
    } else {
        openFile();
    }
};

const handleActionClick = () => {
    if (showProgress.value) {
        // 取消操作
        if (isUploading.value) {
            if (props.message.clientId) {
                websocketService.cancelUpload(props.message.clientId);
                ElMessage.success('已取消上传');
            }
        } else if (isDownloading.value) {
            currentDownloadAbort.value?.();
            isDownloading.value = false;
            downloadProgress.value = 0;
            currentDownloadAbort.value = null;
            ElMessage.success('已取消下载');
        }
    } else {
        // 下载或打开
        if (!props.isSelf && !isDownloaded.value) {
            startDownload();
        } else {
            openFile();
        }
    }
};

const startDownload = async () => {
    if (!props.message.url) {
        ElMessage.error('文件地址无效');
        return;
    }
    isDownloading.value = true;
    downloadProgress.value = 0;

    try {
        const { promise, abort } = await fileService.downloadFile(
            props.message.url,
            props.message.fileName,
            (percent) => { downloadProgress.value = percent; }
        );
        currentDownloadAbort.value = abort;
        
        const localPath = await promise;
        // 更新内存和数据库中的 localPath
        chatStore.updateFileLocalPath(props.message.sessionId, props.message.clientId || '', props.message.msgId, localPath);
        isDownloading.value = false;
        currentDownloadAbort.value = null;
        ElMessage.success('下载完成');
        // 下载完成后在资源管理器中打开
        openFile();
    } catch (e: any) {
        isDownloading.value = false;
        downloadProgress.value = 0;
        currentDownloadAbort.value = null;
        console.error('[FileBubble] Download failed:', e);
        if (e?.message !== 'Download cancelled by user') {
            ElMessage.error('下载失败：' + (e?.message || ''));
        }
    }
};

const openFile = async () => {
    // 优先打开本地文件路径
    if (props.message.localPath) {
        try {
            const ok = await settingService.showInFolder(props.message.localPath);
            if (!ok) {
                ElMessage.error('文件已过期或已删除');
            }
        } catch (error) {
            console.error('[FileBubble] Failed to show in folder:', error);
            ElMessage.error('文件已过期或已删除');
        }
        return;
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
@use "@/src/style/_constant.scss" as *;

.file-message-bubble {
    display: flex;
    flex-direction: column;
    width: 260px;
    background-color: #e8eaed;
    /* 浅灰色背景，类似接收方 */
    border-radius: 12px;
    cursor: pointer;
    box-sizing: border-box;
    overflow: hidden;
    color: #333;

    &.is-self {
        background-color: white;

        .file-info-area {

            .file-size,
            .status-text,
            .status-percent,
            .success-status,
            .failed-status {
                color: rgba(255, 255, 255, 0.8);
            }

            .failed-status {
                color: #ff5252; // 发送方失败时依然用红色强调
            }

            .progress-bar-bg {
                background-color: rgba(255, 255, 255, 0.3);

                .progress-bar-fill {
                    background-color: #fff;
                }
            }
        }

        .file-action-bar {
            border-top-color: rgba(255, 255, 255, 0.2);
            background-color: white;

            .action-btn {
                color: #fff;

                &.btn-cancel {
                    background-color: rgba(255, 255, 255, 0.2);
                }
            }
        }
    }

    .file-content-main {
        display: flex;
        padding: 12px;
        gap: 12px;
        align-items: flex-start;
        background-color: white;
    }

    .file-icon-wrapper {
        position: relative;
        width: 45px;
        height: 56px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;

        .file-bg-shape {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 0;
            /* SVG在最下层 */
        }


        .file-ext {
            position: absolute;
            bottom: 10px;
            left: -5px;
            font-size: 13px;
            font-weight: bold;
            color: #fff;
            padding: 0 4px;
            /* 往下靠一点，给折角留位 */
            white-space: nowrap; // 防截断折行
            border-radius: 2px;
            z-index: 1;
            /* 保证文字在 SVG 之上 */
        }
    }

    .file-info-area {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;

        .file-name {
            font-size: 14px;
            font-weight: 500;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            margin-bottom: 6px;
            line-height: 1.2;
        }

        .file-status-info {
            display: flex;
            flex-direction: column;
            gap: 4px;

            .size-and-status-text {
                display: flex;
                flex-direction: column;
                align-items: flex-start;
                gap: 8px;
                font-size: 11px;
                line-height: 1.2;

                .file-size {
                    color: $color-text-secondary;
                }

                .status-indicator {
                    display: flex;
                    align-items: center;
                    gap: 4px;

                    .status-text {
                        color: $color-text-secondary;
                    }

                    .status-percent {
                        color: $color-primary;
                        font-weight: 500;
                    }

                    .success-status {
                        color: $color-text-placeholder;
                    }

                    .failed-status {
                        color: #ff5252;
                    }

                    .downloaded-status {
                        display: flex;
                        align-items: center;
                        gap: 2px;
                        color: #0f9d58;
                        /* 成功绿色 */

                        svg {
                            display: block; // 修复 SVG 默认 inline 带来的底部留白问题
                        }
                    }

                    .undownloaded-status {
                        color: $color-text-placeholder;
                    }
                }
            }

            .progress-bar-bg {
                height: 4px;
                background-color: #d1d3d4;
                border-radius: 2px;
                overflow: hidden;
                width: 100%;

                .progress-bar-fill {
                    height: 100%;
                    background-color: $color-primary;
                    border-radius: 2px;
                    transition: width 0.2s ease;
                }
            }
        }
    }

    .file-action-bar {
        background-color: white;
        border-top: 1px solid rgba(0, 0, 0, 0.05);
        padding: 0px 12px;
        display: flex;
        justify-content: flex-end;

        .action-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
            padding: 4px 12px;
            border-radius: 16px;
            font-size: 13px;
            font-weight: 500;
            color: $color-primary;
            transition: all 0.2s;
            cursor: pointer;

            /* "下载"/"打开" 状态是文字形式，"取消"状态像个按钮块 */
            &.btn-cancel {
                background-color: rgba(0, 0, 0, 0.05);
                color: $color-text-secondary;
                padding: 4px 10px;
                border-radius: 4px;
            }

            &:hover {
                opacity: 0.8;
            }
        }
    }
}
</style>
