<template>
    <div class="file-message-bubble" :class="{ 'is-self': props.isSelf, 'is-downloaded': isDownloaded }" @click="handleClick">
        <!-- 主体信息区域 -->
        <div class="file-content-main">
            <!-- 左侧精致矢量折角文档图标 -->
            <div class="file-icon-wrapper">
                <div class="document-icon">
                    <svg class="document-svg" viewBox="0 0 44 54" width="44" height="54" fill="none">
                        <defs>
                            <linearGradient :id="`doc-bg-${docUid}`" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" :stop-color="fileTheme.color1" />
                                <stop offset="100%" :stop-color="fileTheme.color2" />
                            </linearGradient>
                            
                            <linearGradient :id="`fold-bg-${docUid}`" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stop-color="#ffffff" stop-opacity="0.8" />
                                <stop offset="100%" stop-color="#ffffff" stop-opacity="0.4" />
                            </linearGradient>

                            <filter :id="`fold-shadow-${docUid}`" x="-30%" y="-30%" width="160%" height="160%">
                                <feDropShadow dx="-1" dy="1.5" stdDeviation="1.2" flood-color="rgba(0, 0, 0, 0.28)" />
                            </filter>
                        </defs>

                        <!-- 主文件切角多边形 -->
                        <path
                            d="M 6,0 L 30,0 L 44,14 L 44,48 A 6,6 0 0,1 38,54 L 6,54 A 6,6 0 0,1 0,48 L 0,6 A 6,6 0 0,1 6,0 Z"
                            :fill="`url(#doc-bg-${docUid})`"
                        />

                        <!-- 折角下方的自然暗部阴影 -->
                        <path
                            d="M 30,0 L 30,14 L 44,14 Z"
                            fill="rgba(0, 0, 0, 0.12)"
                        />

                        <!-- 折角翻折主体 -->
                        <path
                            d="M 30,0 L 30,11 A 3,3 0 0,0 33,14 L 44,14 Z"
                            :fill="`url(#fold-bg-${docUid})`"
                            :filter="`url(#fold-shadow-${docUid})`"
                        />
                    </svg>
                    <span class="document-ext">{{ fileExtension }}</span>
                </div>
            </div>

            <!-- 右侧详情与状态 -->
            <div class="file-info-area">
                <div class="file-name" :title="props.message.fileName">
                    {{ props.message.fileName }}
                </div>

                <div class="file-status-info">
                    <div class="size-and-status-text">
                        <span class="file-size">
                            <template v-if="showProgress">{{ currentSizeStr }} / </template>
                            {{ formatSize(props.message.size) }}
                        </span>
                        
                        <div class="status-indicator" v-if="!props.isSelf || showProgress">
                            <!-- 进度中 -->
                            <template v-if="showProgress">
                                <span class="status-text">{{ progressText }}</span>
                                <span class="status-percent">{{ progressPercent }}%</span>
                            </template>
                            
                            <!-- 接收方：已接收 / 未下载 -->
                            <template v-else-if="!props.isSelf">
                                <span v-if="isDownloaded" class="downloaded-status">
                                    <svg class="check-icon" viewBox="0 0 24 24" width="13" height="13">
                                        <path fill="currentColor"
                                            d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                                    </svg>
                                    已接收
                                </span>
                                <span v-else class="undownloaded-status">未下载</span>
                            </template>
                        </div>
                    </div>

                    <!-- 上传/下载进度条 -->
                    <div v-if="showProgress" class="progress-bar-bg">
                        <div class="progress-bar-fill" :style="{ width: progressPercent + '%' }"></div>
                    </div>
                </div>
            </div>

            <!-- 右侧整体垂直居中的错误图标（仅发送失败时显示） -->
            <div v-if="props.isSelf && isFailed" class="failed-icon-wrap" title="发送失败">
                <CloseCircle weight="Filled" :size="20" class="failed-icon" />
            </div>
        </div>

        <!-- 底部操作按钮区域 -->
        <div class="file-action-bar" v-if="showActionBar" @click.stop="handleActionClick">
            <button class="action-btn" :class="{ 'btn-cancel': showProgress }">
                <svg v-if="actionIcon === 'download'" class="action-icon" viewBox="0 0 24 24" width="13" height="13">
                    <path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
                </svg>
                <svg v-else-if="actionIcon === 'open'" class="action-icon" viewBox="0 0 24 24" width="13" height="13">
                    <path fill="currentColor" d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/>
                </svg>
                <span>{{ actionText }}</span>
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ILocalFileMessage } from '@shared/types/chatMessage';
import { fileService } from '@/src/services/fileService';
import { settingService } from '@/src/services/settingService';
import { ElMessage } from 'element-plus';
import { ImTypes } from '@shared/types';
import { messageService } from '@/src/services';
import { cancelUpload } from '@/src/composables/useChatPage';
import { APP_CONSTANTS as config } from '@shared/config/constants';
import { CloseCircle } from 'reicon-vue';

interface Props {
    message: ILocalFileMessage;
    isSelf: boolean;
}

const props = defineProps<Props>();

const docUid = computed(() => {
    return (props.message.clientId || props.message.msgId || 'doc').replace(/[^a-zA-Z0-9]/g, '');
});

const isFailed = computed(() => props.message.status === ImTypes.MessageStatus.MESSAGE_STATUS_FAILED);

const isUploading = computed(() => {
    if (isFailed.value) return false;
    return props.isSelf && props.message.uploadProgress !== 100;
});

// 本地下载状态
const isDownloading = ref(false);
const downloadProgress = ref(0);
const currentDownloadAbort = ref<(() => void) | null>(null);

// 是否已下载 (基于 localPath 字段)
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
    if (showProgress.value) return true;
    if (!isDownloaded.value) return true;
    if (!props.isSelf) return true;
    return false;
});

const actionText = computed(() => {
    if (showProgress.value) return '取消';
    return isDownloaded.value ? '打开' : '下载';
});

const actionIcon = computed(() => {
    if (showProgress.value) return '';
    return isDownloaded.value ? 'open' : 'download';
});

// --- 文件类型解析与配色系统 ---
const fileExtension = computed(() => {
    const name = props.message.fileName || '';
    const lastDotIndex = name.lastIndexOf('.');
    if (lastDotIndex !== -1 && lastDotIndex < name.length - 1) {
        return name.slice(lastDotIndex + 1).toUpperCase().substring(0, 4);
    }
    // 没有扩展名时（如 Dockerfile, LICENSE），取前4个字符或 FILE
    return name.slice(0, 4).toUpperCase() || 'FILE';
});

const fileTheme = computed(() => {
    const ext = fileExtension.value.toLowerCase();
    const map: Record<string, { color1: string; color2: string }> = {
        // PDF 文档 - 鲜红
        pdf: { color1: '#f87171', color2: '#ef4444' },

        // Word 文档 - 经典蓝
        doc: { color1: '#60a5fa', color2: '#2563eb' },
        docx: { color1: '#60a5fa', color2: '#2563eb' },
        wps: { color1: '#60a5fa', color2: '#2563eb' },

        // Excel 表格 - 翡翠绿
        xls: { color1: '#4ade80', color2: '#16a34a' },
        xlsx: { color1: '#4ade80', color2: '#16a34a' },
        csv: { color1: '#4ade80', color2: '#16a34a' },
        et: { color1: '#4ade80', color2: '#16a34a' },

        // PPT 演示文稿 - 活力橙
        ppt: { color1: '#fb923c', color2: '#ea580c' },
        pptx: { color1: '#fb923c', color2: '#ea580c' },
        dps: { color1: '#fb923c', color2: '#ea580c' },
        key: { color1: '#fb923c', color2: '#ea580c' },

        // 压缩文件 - 典雅紫
        zip: { color1: '#a78bfa', color2: '#7c3aed' },
        rar: { color1: '#a78bfa', color2: '#7c3aed' },
        '7z': { color1: '#a78bfa', color2: '#7c3aed' },
        tar: { color1: '#a78bfa', color2: '#7c3aed' },
        gz: { color1: '#a78bfa', color2: '#7c3aed' },
        bz2: { color1: '#a78bfa', color2: '#7c3aed' },
        xz: { color1: '#a78bfa', color2: '#7c3aed' },
        iso: { color1: '#a78bfa', color2: '#7c3aed' },
        dmg: { color1: '#a78bfa', color2: '#7c3aed' },

        // 纯文本 / 日志 / Markdown - 石板灰
        txt: { color1: '#94a3b8', color2: '#64748b' },
        md: { color1: '#94a3b8', color2: '#64748b' },
        log: { color1: '#94a3b8', color2: '#64748b' },
        rtf: { color1: '#94a3b8', color2: '#64748b' },

        // 代码与配置 - 丰富区分
        js: { color1: '#facc15', color2: '#ca8a04' },
        json: { color1: '#facc15', color2: '#d97706' },
        yaml: { color1: '#facc15', color2: '#d97706' },
        yml: { color1: '#facc15', color2: '#d97706' },
        xml: { color1: '#facc15', color2: '#d97706' },
        ts: { color1: '#38bdf8', color2: '#0284c7' },
        env: { color1: '#38bdf8', color2: '#0284c7' },
        conf: { color1: '#38bdf8', color2: '#0284c7' },
        ini: { color1: '#38bdf8', color2: '#0284c7' },
        vue: { color1: '#34d399', color2: '#059669' },
        py: { color1: '#34d399', color2: '#0d9488' },
        java: { color1: '#f87171', color2: '#dc2626' },
        c: { color1: '#60a5fa', color2: '#1d4ed8' },
        cpp: { color1: '#60a5fa', color2: '#1d4ed8' },
        go: { color1: '#38bdf8', color2: '#0891b2' },
        rs: { color1: '#fb923c', color2: '#c2410c' },
        sql: { color1: '#06b6d4', color2: '#0e7490' },
        sh: { color1: '#818cf8', color2: '#4f46e5' },
        bat: { color1: '#818cf8', color2: '#4f46e5' },
        html: { color1: '#fb7185', color2: '#e11d48' },
        css: { color1: '#38bdf8', color2: '#4f46e5' },
        scss: { color1: '#f472b6', color2: '#db2777' },

        // 音频媒体 - 霓虹粉
        mp3: { color1: '#f472b6', color2: '#db2777' },
        wav: { color1: '#f472b6', color2: '#db2777' },
        flac: { color1: '#f472b6', color2: '#db2777' },
        aac: { color1: '#f472b6', color2: '#db2777' },
        m4a: { color1: '#f472b6', color2: '#db2777' },

        // 视频媒体 - 玫瑰红
        mp4: { color1: '#fb7185', color2: '#e11d48' },
        mov: { color1: '#fb7185', color2: '#e11d48' },
        avi: { color1: '#fb7185', color2: '#e11d48' },
        mkv: { color1: '#fb7185', color2: '#e11d48' },

        // 图片源文件
        psd: { color1: '#38bdf8', color2: '#1d4ed8' },
        ai: { color1: '#fb923c', color2: '#b45309' },

        // 可执行文件 / 安装包 - 深灰石板
        exe: { color1: '#64748b', color2: '#334155' },
        msi: { color1: '#64748b', color2: '#334155' },
        apk: { color1: '#4ade80', color2: '#15803d' },
    };
    return map[ext] || { color1: '#38bdf8', color2: '#2563eb' };
});

// --- 工具方法 ---
const formatSize = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const val = parseFloat((bytes / Math.pow(k, i)).toFixed(1));
    return val + ' ' + sizes[i];
};

// --- 事件处理 ---
const handleClick = async () => {
    if (showProgress.value) return;

    if (!isDownloaded.value) {
        startDownload();
    } else {
        openFile();
    }
};

const handleActionClick = () => {
    if (showProgress.value) {
        if (isUploading.value) {
            if (props.message.clientId) {
                cancelUpload(props.message.clientId);
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
        if (!isDownloaded.value) {
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
        props.message.localPath = localPath;
        messageService.saveMessage(props.message);

        isDownloading.value = false;
        currentDownloadAbort.value = null;
    } catch (e: any) {
        isDownloading.value = false;
        downloadProgress.value = 0;
        currentDownloadAbort.value = null;
        console.error('[FileBubble] Download failed:', e);
        if (e?.message !== config.ERR_DOWNLOAD_CANCELLED) {
            ElMessage.error('下载失败：' + (e?.message || ''));
        }
    }
};

const openFile = async () => {
    if (props.message.localPath) {
        try {
            const ok = await settingService.showInFolder(props.message.localPath);
            if (!ok) {
                ElMessage.error('文件已过期或已删除');
                props.message.localPath = '';
                messageService.saveMessage(props.message);
            }
        } catch (error) {
            console.error('[FileBubble] Failed to show in folder:', error);
            ElMessage.error('文件已过期或已删除');
            props.message.localPath = '';
            messageService.saveMessage(props.message);
        }
    }
};
</script>

<style scoped lang="scss">
@use "@/src/style/_constant.scss" as *;

.file-message-bubble {
    display: flex;
    flex-direction: column;
    width: 275px;
    background: var(--surface-default, #ffffff);
    border-radius: 12px;
    cursor: pointer;
    box-sizing: border-box;
    overflow: hidden;
    border: 1px solid var(--border-divider, #e8ecef);
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.04);
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    user-select: none;

    &:hover {
        border-color: rgba(var(--color-primary-rgb, 64, 158, 255), 0.35);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
        transform: translateY(-1px);
    }

    [data-theme='dark'] & {
        background: var(--surface-default, #1e293b);
        border-color: var(--border-color, #334155);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);

        &:hover {
            border-color: var(--color-primary, #409eff);
            box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
        }
    }

    &.is-self {
        background: var(--surface-default, #ffffff);

        [data-theme='dark'] & {
            background: var(--surface-default, #1e293b);
        }
    }

    .file-content-main {
        display: flex;
        padding: 12px 14px;
        gap: 12px;
        align-items: center;
    }

    .file-icon-wrapper {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;

        .document-icon {
            position: relative;
            width: 44px;
            height: 54px;
            flex-shrink: 0;
            filter: drop-shadow(0 2px 5px rgba(0, 0, 0, 0.12));
            transition: transform 0.2s ease;

            .document-svg {
                display: block;
                width: 44px;
                height: 54px;
            }

            .document-ext {
                position: absolute;
                bottom: 8px;
                left: 0;
                right: 0;
                text-align: center;
                color: #ffffff;
                font-size: 11px;
                font-weight: 800;
                letter-spacing: 0.5px;
                text-transform: uppercase;
                padding: 0 4px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
                pointer-events: none;
            }
        }
    }

    .file-info-area {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        justify-content: center;

        .file-name {
            font-size: 13.5px;
            font-weight: 500;
            color: var(--text-primary, #1e293b);
            line-height: 1.35;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
            word-break: break-all;
            margin-bottom: 6px;

            [data-theme='dark'] & {
                color: var(--text-primary, #f1f5f9);
            }
        }

        .file-status-info {
            display: flex;
            flex-direction: column;
            gap: 4px;

            .size-and-status-text {
                display: flex;
                align-items: center;
                justify-content: space-between;
                font-size: 11.5px;
                line-height: 1.2;

                .file-size {
                    color: var(--text-secondary, #64748b);
                    font-variant-numeric: tabular-nums;
                }

                .status-indicator {
                    display: flex;
                    align-items: center;
                    gap: 3px;

                    .status-text {
                        color: var(--text-secondary, #64748b);
                    }

                    .status-percent {
                        color: $color-primary;
                        font-weight: 600;
                        font-variant-numeric: tabular-nums;
                    }

                    .downloaded-status {
                        display: flex;
                        align-items: center;
                        gap: 3px;
                        color: #10b981;
                        font-weight: 500;
                        background: rgba(16, 185, 129, 0.08);
                        padding: 1.5px 6px;
                        border-radius: 4px;
                        line-height: 1.2;

                        .check-icon {
                            display: block;
                        }

                        [data-theme='dark'] & {
                            background: rgba(16, 185, 129, 0.18);
                            color: #6ee7b7;
                        }
                    }

                    .undownloaded-status {
                        color: var(--text-placeholder, #94a3b8);
                    }
                }
            }

            .progress-bar-bg {
                height: 4px;
                background-color: var(--border-divider, #e2e8f0);
                border-radius: 999px;
                overflow: hidden;
                width: 100%;
                margin-top: 2px;

                [data-theme='dark'] & {
                    background-color: rgba(255, 255, 255, 0.12);
                }

                .progress-bar-fill {
                    height: 100%;
                    background: linear-gradient(90deg, #3b82f6, #60a5fa);
                    border-radius: 999px;
                    transition: width 0.25s ease-out;
                }
            }
        }
    }

    .failed-icon-wrap {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-left: 6px;

        .failed-icon {
            width: 22px;
            height: 22px;
            color: #ff3b30; // 明亮鲜红
            display: block;
            transition: transform 0.15s ease;

            [data-theme='dark'] & {
                color: #ff453a;
            }
        }
    }

    .file-action-bar {
        border-top: 1px solid var(--border-divider, #f1f5f9);
        padding: 5px 12px;
        display: flex;
        justify-content: flex-end;
        align-items: center;
        background: rgba(0, 0, 0, 0.015);

        [data-theme='dark'] & {
            border-top-color: rgba(255, 255, 255, 0.06);
            background: rgba(255, 255, 255, 0.02);
        }

        .action-btn {
            border: none;
            background: transparent;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
            padding: 4px 10px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 500;
            color: $color-primary;
            transition: all 0.15s ease;
            cursor: pointer;

            .action-icon {
                display: block;
            }

            &:hover {
                background: rgba(var(--color-primary-rgb, 64, 158, 255), 0.1);
                color: $color-primary;
            }

            &:active {
                transform: scale(0.96);
            }

            &.btn-cancel {
                background: rgba(0, 0, 0, 0.04);
                color: var(--text-secondary, #64748b);

                [data-theme='dark'] & {
                    background: rgba(255, 255, 255, 0.08);
                    color: var(--text-secondary, #94a3b8);
                }

                &:hover {
                    background: rgba(239, 68, 68, 0.12);
                    color: #ef4444;
                }
            }
        }
    }
}
</style>
