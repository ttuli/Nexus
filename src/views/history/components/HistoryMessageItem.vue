<template>
    <div class="history-item">
        <div v-if="dateLabel" class="date-divider">{{ dateLabel }}</div>

        <!-- 只有聊天消息：撤回的原消息和通知类消息（撤回通知、群操作通知）在本地查询时就排除了 -->
        <!-- 双击跳转：整行都可触发，打了 data-interactive 的区域（图片、视频、文件卡片）除外 -->
        <!-- 右键菜单：整行都可触发（含图片、视频、文件卡片），菜单由列表统一弹出 -->
        <div class="message-row" @mousedown="onRowMousedown" @dblclick="onRowDblclick"
            @contextmenu.prevent="onRowContextmenu">
            <Avatar class="avatar" :uid="message.fromUserId" type="user" width="34px" height="34px" disable-click />
            <div class="main">
                <div class="meta">
                    <span class="name" :class="{ 'is-self': isSelf }">{{ senderName }}</span>
                    <span class="time">{{ timeText }}</span>
                </div>

                <div v-if="kind === 'text'" class="text">
                    <HighlightText :text="(message as ILocalTextMessage).content" :keyword="keyword" />
                </div>

                <template v-else-if="kind === 'image'">
                    <div class="media" :class="{ clickable: !!mediaUrl }" :style="mediaStyle" data-interactive
                        @click="openImage">
                        <img v-if="thumbSrc" :src="thumbSrc" alt="图片" draggable="false" />
                    </div>
                    <div v-if="mediaCaption" class="media-name" :title="mediaCaption">
                        <HighlightText :text="mediaCaption" :keyword="keyword" />
                    </div>
                </template>

                <template v-else-if="kind === 'video'">
                    <div class="media video" :class="{ clickable: !!mediaUrl }" :style="mediaStyle" data-interactive
                        @click="openVideo">
                        <img v-if="thumbSrc" :src="thumbSrc" alt="视频" draggable="false" />
                        <span class="play"><Play class="app-icon app-icon--md" /></span>
                        <span class="duration">{{ videoDuration }}</span>
                    </div>
                    <div v-if="mediaCaption" class="media-name" :title="mediaCaption">
                        <HighlightText :text="mediaCaption" :keyword="keyword" />
                    </div>
                </template>

                <div v-else-if="kind === 'file'" class="file-card" data-interactive>
                    <span class="file-icon" :style="{ background: fileIconColor }">{{ fileExt }}</span>
                    <div class="file-info">
                        <span class="file-name" :title="fileMessage.fileName">
                            <HighlightText :text="fileMessage.fileName" :keyword="keyword" />
                        </span>
                        <span class="file-size">{{ formatSize(fileMessage.size) }}</span>
                    </div>
                </div>

                <div v-else-if="kind === 'audio'" class="voice">
                    <Soundwave class="app-icon app-icon--sm" />
                    <span>语音</span>
                    <span v-if="voiceSeconds" class="voice-duration">{{ voiceSeconds }}″</span>
                </div>

                <div v-else-if="kind === 'call'" class="call" :class="{ missed: !callCompleted }">
                    <CallCalling class="app-icon app-icon--sm" />
                    <span>{{ callText }}</span>
                </div>

                <div v-else class="text placeholder">{{ fallbackText }}</div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { CallCalling, Play, Soundwave } from 'reicon-vue';
import type {
    IChatMessage, ILocalTextMessage, ILocalImageMessage, ILocalVideoMessage, ILocalFileMessage,
    ILocalAudioMessage, ILocalCallMessage,
} from '@shared/types/chatMessage';
import { CacheOptionType, ImTypes } from '@shared/types';
import { useUserStore } from '@/src/store/user';
import { createGroupNameResolver } from '@/src/utils/displayName';
import { formatCallDuration, formatCallMessage, getLastContent } from '@/src/utils/messageConverter';
import { toResourceUrl } from '@/src/utils/resourceUrl';
import { openPhotoViewer, openVideoViewer } from '@/src/utils/window';
import { formatFileSize as formatSize, getFileExtension, getFileGradient } from '@/src/utils/fileFormat';
import { fileService } from '@/src/services/fileService';
import { ElMessage } from 'element-plus';

const props = defineProps<{
    message: IChatMessage;
    /** 群会话的群 ID：发送者优先显示群昵称 */
    groupId?: number;
    /** 跨天时显示在本条上方的日期，不跨天为空 */
    dateLabel?: string;
    /** 当前的搜索关键词：文字内容和文件名里命中的部分高亮 */
    keyword?: string;
}>();

const emit = defineEmits<{
    /** 在消息行的非交互区域双击：请求在主窗口定位到这条消息 */
    (e: 'jump', message: IChatMessage): void;
    /** 在消息行上右键：请求在点击位置弹出这条消息的菜单 */
    (e: 'contextmenu', event: MouseEvent, message: IChatMessage): void;
}>();

const MessageType = ImTypes.MessageType;
const MEDIA_MAX_WIDTH = 200;
const MEDIA_MAX_HEIGHT = 160;

const userStore = useUserStore();
const isSelf = computed(() => props.message.fromUserId === userStore.userID);
// 群昵称 > 好友备注 > 用户名
const resolveName = computed(() => createGroupNameResolver(props.groupId));

const senderName = computed(() => {
    if (isSelf.value) return '我';
    return resolveName.value(props.message.fromUserId) || `用户${props.message.fromUserId}`;
});

const kind = computed<'text' | 'image' | 'video' | 'file' | 'audio' | 'call' | 'other'>(() => {
    switch (props.message.type) {
        case MessageType.CHAT_TEXT:
        case MessageType.GROUP_TEXT:
            return 'text';
        case MessageType.CHAT_IMAGE:
        case MessageType.GROUP_IMAGE:
            return 'image';
        case MessageType.CHAT_VIDEO:
        case MessageType.GROUP_VIDEO:
            return 'video';
        case MessageType.CHAT_FILE:
        case MessageType.GROUP_FILE:
            return 'file';
        case MessageType.CHAT_AUDIO:
        case MessageType.GROUP_AUDIO:
            return 'audio';
        case MessageType.CHAT_CALL:
            return 'call';
        default:
            return 'other';
    }
});

const timeText = computed(() => {
    const date = new Date(props.message.sendTime);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
});

// ─── 图片 / 视频 ────────────────────────────────────────────────────────────

const mediaMessage = computed(() => props.message as ILocalImageMessage | ILocalVideoMessage);
const mediaUrl = computed(() => mediaMessage.value.url || mediaMessage.value.localPath || '');

/** 缩略图：优先用消息里已有的，否则按聊天窗口同样的缓存规则生成 localcache 地址（只拼地址，不落库） */
const thumbSrc = computed(() => {
    const msg = mediaMessage.value;
    if (msg.thumbnailUrl) return msg.thumbnailUrl;
    const opts = { width: msg.thumbnailWidth, height: msg.thumbnailHeight };
    if (kind.value === 'image') {
        const src = msg.localPath || msg.url;
        return src ? toResourceUrl(src, { cacheType: CacheOptionType.IMAGE_THUMB, ...opts }) : '';
    }
    return msg.url ? toResourceUrl(msg.url, { cacheType: CacheOptionType.VIDEO_THUMB, ...opts }) : '';
});

/** 按原始比例缩到列表里的最大尺寸；没有尺寸信息时给方形占位 */
const mediaStyle = computed(() => {
    const msg = mediaMessage.value;
    const width = msg.thumbnailWidth || msg.width || 0;
    const height = msg.thumbnailHeight || msg.height || 0;
    if (width <= 0 || height <= 0) return { width: '120px', height: '120px' };
    const ratio = Math.min(MEDIA_MAX_WIDTH / width, MEDIA_MAX_HEIGHT / height, 1);
    return { width: `${Math.round(width * ratio)}px`, height: `${Math.round(height * ratio)}px` };
});

const videoDuration = computed(() => formatCallDuration((props.message as ILocalVideoMessage).duration || 0));

/** 带关键词搜到的图片 / 视频是文件名命中的：在缩略图下面标出文件名，看得出为什么搜到它 */
const mediaCaption = computed(() => (props.keyword ? mediaMessage.value.fileName || '' : ''));

const mediaSize = () => {
    const msg = mediaMessage.value;
    return msg.width && msg.height ? { width: msg.width, height: msg.height } : undefined;
};

/** 正在打开查看器 / 播放器（检查本地文件是异步的），期间再点不重复打开 */
let opening = false;

/** 双击时第二下单击的 detail 是 2：只认第一下，双击图片不会打开两次 */
const isRepeatClick = (event: MouseEvent) => event.detail > 1;

/** 与聊天窗口一致：本地原图还在就看本地的，否则经 localcache 取网络原图 */
const openImage = async (event: MouseEvent) => {
    const msg = mediaMessage.value;
    if (isRepeatClick(event) || opening || !mediaUrl.value) return;
    opening = true;
    try {
        const src = msg.localPath && await fileService.checkLocalFileExists(msg.localPath) ? msg.localPath : msg.url;
        await openPhotoViewer([toResourceUrl(src, { cacheType: CacheOptionType.IMAGE })], 0, mediaSize());
    } catch (e) {
        ElMessage.error('图片已过期或被清理');
        console.error('[HistoryMessageItem] open photo viewer failed:', e);
    } finally {
        opening = false;
    }
};

/** 与聊天窗口一致：只播放已下载到本地的视频，没下载的到聊天窗口里下载 */
const openVideo = async (event: MouseEvent) => {
    const msg = mediaMessage.value;
    if (isRepeatClick(event) || opening) return;
    opening = true;
    try {
        if (!msg.localPath || !(await fileService.checkLocalFileExists(msg.localPath))) {
            ElMessage.info('视频还未下载，请在聊天窗口中下载后播放');
            return;
        }
        const size = mediaSize();
        openVideoViewer(toResourceUrl(msg.localPath, { cacheType: CacheOptionType.VIDEO }), size?.width, size?.height);
    } finally {
        opening = false;
    }
};

// ─── 双击跳转 ───────────────────────────────────────────────────────────────

/** 图片、视频、文件卡片等自身可交互的区域打了 data-interactive，不参与双击跳转 */
const inInteractiveArea = (event: MouseEvent) =>
    (event.target as Element | null)?.closest('[data-interactive]') != null;

const onRowDblclick = (event: MouseEvent) => {
    if (inInteractiveArea(event)) return;
    emit('jump', props.message);
};

/** 双击时浏览器会顺带选中一个词：在跳转区域里拦掉（拖选文字不受影响） */
const onRowMousedown = (event: MouseEvent) => {
    if (event.detail > 1 && !inInteractiveArea(event)) event.preventDefault();
};

// ─── 右键菜单 ───────────────────────────────────────────────────────────────

const onRowContextmenu = (event: MouseEvent) => {
    emit('contextmenu', event, props.message);
};

// ─── 文件 ───────────────────────────────────────────────────────────────────

const fileMessage = computed(() => props.message as ILocalFileMessage);

const fileExt = computed(() => getFileExtension(fileMessage.value.fileName, fileMessage.value.format));

const fileIconColor = computed(() => getFileGradient(fileExt.value));

// ─── 语音 / 通话 / 其他 ─────────────────────────────────────────────────────

/** 语音时长（秒），没有时长信息时不显示 */
const voiceSeconds = computed(() => Math.round((props.message as ILocalAudioMessage).duration || 0));

const callCompleted = computed(() =>
    (props.message as ILocalCallMessage).endReason === ImTypes.CallEndReason.CALL_END_REASON_COMPLETED,
);
const callText = computed(() => formatCallMessage(props.message as ILocalCallMessage, userStore.userID));
const fallbackText = computed(() => getLastContent(props.message, userStore.userID, resolveName.value));
</script>

<style scoped lang="scss">
.history-item {
    padding: 0 12px;

    .date-divider {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 14px 10px 6px;
        font-size: 12px;
        color: $color-text-placeholder;

        &::before,
        &::after {
            content: '';
            flex: 1;
            height: 1px;
            background-color: $color-border-divider;
            opacity: 0.7;
        }
    }

    .message-row {
        display: flex;
        gap: 10px;
        padding: 8px 10px;
        border-radius: 8px;
        transition: background-color 0.15s ease;

        &:hover {
            background-color: $bg-hover;
        }

        // 尺寸写死在这里：Avatar 的宽高靠 CSS v-bind，挂载后才生效，虚拟列表首次测量时
        // 默认头像图还是原图尺寸，会把整行量成好几百像素，滚出视口卸载后错误高度就留在缓存里
        .avatar {
            flex-shrink: 0;
            width: 34px;
            height: 34px;
            margin-top: 2px;
        }
    }

    .main {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 4px;
    }

    .meta {
        width: 100%;
        display: flex;
        align-items: baseline;
        gap: 8px;

        .name {
            min-width: 0;
            font-size: 13px;
            color: $color-text-secondary;
            @include ellipsis;

            &.is-self {
                color: $color-primary;
            }
        }

        .time {
            margin-left: auto;
            flex-shrink: 0;
            font-size: 12px;
            color: $color-text-placeholder;
        }
    }

    .text {
        max-width: 100%;
        font-size: 14px;
        line-height: 1.6;
        color: $color-text-primary;
        white-space: pre-wrap;
        word-break: break-word;
        user-select: text;

        &.placeholder {
            color: $color-text-secondary;
        }
    }

    // 与聊天窗口的图片 / 视频气泡一致：圆角、浅投影，悬浮时叠一层透明黑幕
    .media {
        position: relative;
        margin-top: 2px;
        border-radius: 8px;
        overflow: hidden;
        background-color: $bg-card;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);

        &.clickable {
            cursor: pointer;
        }

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

        img {
            display: block;
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        &.video {
            // 播放按钮和时长浮在悬浮黑幕之上
            .play,
            .duration {
                z-index: 1;
            }

            .play {
                position: absolute;
                top: 50%;
                left: 50%;
                width: 36px;
                height: 36px;
                transform: translate(-50%, -50%);
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 50%;
                background-color: rgba(0, 0, 0, 0.45);
                color: #fff;
            }

            .duration {
                position: absolute;
                right: 6px;
                bottom: 6px;
                padding: 1px 6px;
                border-radius: 4px;
                background-color: rgba(0, 0, 0, 0.5);
                font-size: 11px;
                color: #fff;
            }
        }
    }

    .file-card {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 260px;
        max-width: 100%;
        margin-top: 2px;
        padding: 10px 12px;
        box-sizing: border-box;
        border: 1px solid $color-border;
        border-radius: 8px;
        background-color: $bg-card;

        .file-icon {
            flex-shrink: 0;
            width: 34px;
            height: 40px;
            display: flex;
            align-items: flex-end;
            justify-content: center;
            padding-bottom: 5px;
            box-sizing: border-box;
            border-radius: 4px 10px 4px 4px;
            font-size: 9px;
            font-weight: $font-weight-semibold;
            color: #fff;
            letter-spacing: 0.3px;
        }

        .file-info {
            min-width: 0;
            display: flex;
            flex-direction: column;
            gap: 2px;

            .file-name {
                font-size: 13px;
                color: $color-text-primary;
                @include ellipsis;
            }

            .file-size {
                font-size: 12px;
                color: $color-text-placeholder;
            }
        }
    }

    .media-name {
        max-width: 200px;
        font-size: 12px;
        color: $color-text-secondary;
        @include ellipsis;
    }

    .call,
    .voice {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 14px;
        color: $color-text-primary;
    }

    .call.missed {
        color: $color-text-secondary;
    }

    .voice .voice-duration {
        color: $color-text-secondary;
    }
}
</style>
