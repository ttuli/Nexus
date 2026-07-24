import { ref, toRaw } from 'vue';
import { ImTypes, ApiTypes, CacheOptionType } from '@shared/types';
import type { IChatMessage } from '@shared/types/chatMessage';
import { APP_CONSTANTS } from '@shared/config/constants';
import { ElMessage } from 'element-plus';
import { useSessionStore } from '@/src/store/session';
import { useMessageStore } from '@/src/store/message';
import { useUserStore } from '@/src/store/user';
import type { IHistoryFetcher } from '@/src/store/message';
import { getLastContent, isSystemNotificationMessage } from '@/src/utils/messageConverter';
import {
    buildTextWsMessage,
    buildImageLocalMsg, buildImageWsPayload,
    buildFileLocalMsg, buildFileWsPayload,
    buildVideoLocalMsg, buildVideoWsPayload,
} from '@/src/utils/messageBuilder';
import { toResourceUrl } from '@/src/utils/resourceUrl';
import { extractVideoFrame } from '@/src/utils/mediaUtils';

// ─── Service Imports（仅在 Composable 层引入，直接编排 I/O）─────────────────────
import { chatService } from '@/src/services/chatService';
import { websocketService } from '@/src/services/websocketService';
import { fileService } from '@/src/services/fileService';
import { messageService } from '@/src/services/messageService';
import { sessionService } from '@/src/services/sessionService';

// ─── 历史拉取 DI 适配器（loadMore 仍由 store 编排，chatService 作为 fetcher 注入）──
const fetcher: IHistoryFetcher = chatService;

/**
 * 在途上传取消句柄：clientId → abort。发送媒体消息时登记，完成/失败/取消时移除。
 * 上传编排在本层，故取消句柄也归本层；由消息气泡组件直接调用 cancelUpload 取消。
 */
const uploadAbortControllers = new Map<string, () => void>();

/**
 * 取消正在进行的上传（供消息气泡组件调用）
 */
export function cancelUpload(clientId: string) {
    const abort = uploadAbortControllers.get(clientId);
    if (abort) {
        abort();
        uploadAbortControllers.delete(clientId);
    }
}

/**
 * 媒体消息发送规格：描述各媒体类型的差异化部分。
 * sendMediaMessage 通用流水线通过此接口接入具体的消息构建逻辑。
 */
interface MediaMessageSpec {
    /** 待上传的文件对象 */
    file: File;
    /** 文件上传接口所需的媒体类型标识 */
    fileType: ApiTypes.file.FileType;
    /** 构建本地占位消息（元数据已由调用方预处理） */
    buildLocalMsg(
        sessionId: string,
        sessionKey: string,
        chatType: ImTypes.SessionType,
        userId: number
    ): { clientId: string; localMsg: IChatMessage };
    /** 上传完成后，利用 ossUrl 构建发送给服务端的 WS 消息 */
    buildWsPayload(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        localMsg: any,
        ossUrl: string,
        sessionId: string,
        sessionKey: string,
        chatType: ImTypes.SessionType,
        userId: number
    ): ImTypes.WSMessage;
}

export function useChatPage() {
    const sessionStore = useSessionStore();
    const messageStore = useMessageStore();
    const userStore = useUserStore();
    const inputText = ref('');
    const isSending = ref(false);

    /**
     * 发送成功后更新会话列表摘要并持久化（跨 Store 编排）
     */
    function refreshSessionSummary(sessionKey: string, msg: IChatMessage) {
        const updatedSession = sessionStore.updateSessionSummary(sessionKey, {
            last_content: getLastContent(msg),
            last_message_time: msg.sendTime || Date.now(),
            last_sender: msg.fromUserId,
        });
        if (updatedSession) {
            void sessionService.saveMany([toRaw(updatedSession)]);
        }
    }

    /**
     * 发送文本消息：本地乐观入列 → WS 发送 → 落库 → 更新会话摘要。
     * store 仅负责 upsert / 状态 mutation，I/O 与编排均在本层。
     */
    async function sendTextMessage(content?: string) {
        const text = (content !== undefined ? content : inputText.value).trim();
        if (!text) return;

        isSending.value = true;
        try {
            const sessionKey = sessionStore.currentSessionKey;
            const chatType = sessionStore.currentSessionType;
            const session = sessionStore.getSession(sessionKey);
            const sessionId = session?.session_id || '';

            const { msg, clientId, localMsg } = buildTextWsMessage(text, sessionId, sessionKey, chatType, userStore.getUserID());
            const storedMsg = messageStore.upsertMessage(localMsg);

            try {
                const result = await websocketService.send(msg, clientId, sessionId);
                if (!result.success || !result.data?.sent) {
                    storedMsg.status = ImTypes.MessageStatus.MESSAGE_STATUS_FAILED;
                }
            } catch (e) {
                console.error('[useChatPage] sendTextMessage send failed:', e);
                storedMsg.status = ImTypes.MessageStatus.MESSAGE_STATUS_FAILED;
            } finally {
                await messageService.saveMessage(toRaw(storedMsg) as IChatMessage);
            }

            refreshSessionSummary(sessionKey, storedMsg);
            if (content === undefined) {
                inputText.value = '';
            }
        } catch (e) {
            console.error('[useChatPage] sendTextMessage failed:', e);
        } finally {
            isSending.value = false;
        }
    }

    /**
     * 媒体消息发送通用流水线：上传（带进度）→ WS 发送 → 错误处理 → SQLite 落库。
     * 具体消息类型通过 MediaMessageSpec 注入差异化逻辑。storedMsg 为 store 内响应式引用，
     * 上传进度 / URL / 状态就地更新（与消息气泡内直接改字段的既有模式一致）。
     */
    async function sendMediaMessage(
        spec: MediaMessageSpec,
        logTag: string,
    ): Promise<IChatMessage | undefined> {
        const sessionKey = sessionStore.currentSessionKey;
        const session = sessionStore.getSession(sessionKey);
        if (!session) {
            ElMessage.error('获取会话失败');
            return undefined;
        }
        const sessionId = session.session_id || '';
        const chatType = session.type;
        const userId = userStore.getUserID();

        const { clientId, localMsg } = spec.buildLocalMsg(sessionId, sessionKey, chatType, userId);
        const storedMsg = messageStore.upsertMessage(localMsg) as any;

        try {
            const { promise, abort } = fileService.uploadFile(
                spec.file,
                spec.fileType,
                (progress) => { storedMsg.uploadProgress = progress; }
            );
            uploadAbortControllers.set(clientId, abort);

            const ossUrl = await promise;
            uploadAbortControllers.delete(clientId);
            storedMsg.url = ossUrl;

            const finalMsg = spec.buildWsPayload(localMsg, ossUrl, sessionId, sessionKey, chatType, userId);
            const result = await websocketService.send(finalMsg, clientId, sessionId);
            if (!result.success || !result.data?.sent) {
                storedMsg.status = ImTypes.MessageStatus.MESSAGE_STATUS_FAILED;
            }
        } catch (e) {
            console.error(`[useChatPage] ${logTag} failed:`, e);
            storedMsg.status = ImTypes.MessageStatus.MESSAGE_STATUS_FAILED;
            storedMsg.uploadProgress = 0;
            uploadAbortControllers.delete(clientId);
        } finally {
            await messageService.saveMessage(toRaw(storedMsg) as IChatMessage);
        }
        return storedMsg;
    }

    /**
     * 发送图片消息
     */
    async function sendImageMessage(file: File) {
        try {
            const currentKey = sessionStore.currentSessionKey;
            // ── 图片专属：预读尺寸以计算缩略图维度 ──────────────────────────
            const bitmap = await createImageBitmap(file);
            const imgWidth = bitmap.width;
            const imgHeight = bitmap.height;
            let thumbnailWidth = imgWidth;
            let thumbnailHeight = imgHeight;
            if (imgWidth > APP_CONSTANTS.maxImageWidth || imgHeight > APP_CONSTANTS.maxImageHeight) {
                const ratio = Math.min(APP_CONSTANTS.maxImageWidth / imgWidth, APP_CONSTANTS.maxImageHeight / imgHeight);
                thumbnailWidth = Math.round(imgWidth * ratio);
                thumbnailHeight = Math.round(imgHeight * ratio);
            }
            bitmap.close();
            const filePath = window.webUtils.getPathForFile(file);

            const sentMsg = await sendMediaMessage({
                file,
                fileType: ApiTypes.file.FileType.FileTypeChatImage,
                buildLocalMsg: (sessionId, sessionKey, chatType, userId) =>
                    buildImageLocalMsg({
                        url: '',
                        localPath: filePath,
                        uploadProgress: 0,
                        width: imgWidth,
                        height: imgHeight,
                        thumbnailWidth,
                        thumbnailHeight,
                        size: file.size,
                        format: file.type,
                        thumbnailUrl: toResourceUrl(filePath, {
                            cacheType: CacheOptionType.IMAGE_THUMB,
                            width: thumbnailWidth,
                            height: thumbnailHeight
                        }),
                        fileName: file.name
                    }, sessionId, sessionKey, chatType, userId),
                buildWsPayload: (localMsg, ossUrl, sessionId, sessionKey, chatType, userId) =>
                    buildImageWsPayload(
                        { ...localMsg, localPath: undefined, thumbnailUrl: undefined },
                        ossUrl, sessionId, sessionKey, chatType, userId
                    ),
            }, 'sendImageMessage');

            if (sentMsg) refreshSessionSummary(currentKey, sentMsg);
        } catch (e) {
            console.error('[useChatPage] sendImageMessage failed:', e);
        }
    }

    /**
     * 发送文件消息
     */
    async function sendFileMessage(file: File) {
        try {
            const currentKey = sessionStore.currentSessionKey;
            const filePath = window.webUtils.getPathForFile(file);

            const sentMsg = await sendMediaMessage({
                file,
                fileType: ApiTypes.file.FileType.FileTypeChatFile,
                buildLocalMsg: (sessionId, sessionKey, chatType, userId) =>
                    buildFileLocalMsg({
                        url: '',
                        localPath: filePath,
                        uploadProgress: 0,
                        fileName: file.name,
                        size: file.size,
                        format: file.type,
                    }, sessionId, sessionKey, chatType, userId),
                buildWsPayload: (localMsg, ossUrl, sessionId, sessionKey, chatType, userId) =>
                    buildFileWsPayload(localMsg, ossUrl, sessionId, sessionKey, chatType, userId),
            }, 'sendFileMessage');

            if (sentMsg) refreshSessionSummary(currentKey, sentMsg);
        } catch (e) {
            console.error('[useChatPage] sendFileMessage failed:', e);
        }
    }

    /**
     * 发送视频消息
     */
    async function sendVideoMessage(file: File) {
        try {
            const currentKey = sessionStore.currentSessionKey;
            // ── 视频专属：提取封面帧以计算缩略图维度 ──────────────────────────
            const videoMeta = await extractVideoFrame(file);
            const filePath = window.webUtils.getPathForFile(file);

            let thumbnailWidth = videoMeta.width;
            let thumbnailHeight = videoMeta.height;
            if (videoMeta.width > APP_CONSTANTS.maxImageWidth || videoMeta.height > APP_CONSTANTS.maxImageHeight) {
                const ratio = Math.min(APP_CONSTANTS.maxImageWidth / videoMeta.width, APP_CONSTANTS.maxImageHeight / videoMeta.height);
                thumbnailWidth = Math.round(videoMeta.width * ratio);
                thumbnailHeight = Math.round(videoMeta.height * ratio);
            }

            const sentMsg = await sendMediaMessage({
                file,
                fileType: ApiTypes.file.FileType.FileTypeChatFile,
                buildLocalMsg: (sessionId, sessionKey, chatType, userId) =>
                    buildVideoLocalMsg({
                        url: '',
                        localPath: filePath,
                        thumbnailUrl: toResourceUrl(videoMeta.thumbnailUrl, {
                            cacheType: CacheOptionType.IMAGE_THUMB,
                            width: thumbnailWidth,
                            height: thumbnailHeight
                        }),
                        width: videoMeta.width,
                        height: videoMeta.height,
                        duration: videoMeta.duration,
                        thumbnailHeight,
                        thumbnailWidth,
                        uploadProgress: 0,
                        size: file.size,
                        format: file.type,
                        fileName: file.name
                    }, sessionId, sessionKey, chatType, userId),
                buildWsPayload: (localMsg, ossUrl, sessionId, sessionKey, chatType, userId) =>
                    buildVideoWsPayload(
                        { ...localMsg, localPath: undefined, thumbnailUrl: undefined },
                        ossUrl, sessionId, sessionKey, chatType, userId
                    ),
            }, 'sendVideoMessage');

            if (sentMsg) refreshSessionSummary(currentKey, sentMsg);
        } catch (e) {
            console.error('[useChatPage] sendVideoMessage failed:', e);
        }
    }

    /**
     * 加载更多历史消息，并同步更新会话列表摘要
     */
    async function loadMore() {
        const sessionKey = sessionStore.currentSessionKey;
        if (!sessionKey) return;

        // 将 chatService 作为 fetcher 注入
        const loadedMessages = await messageStore.loadMore(sessionKey, fetcher);

        if (loadedMessages && loadedMessages.length > 0) {
            const latestMsg = loadedMessages[loadedMessages.length - 1];
            if (latestMsg) {
                const updatedSession = sessionStore.updateSessionSummary(sessionKey, {
                    last_content: getLastContent(latestMsg, userStore.userID, (id) => userStore.getDisplayName(id)),
                    last_message_time: latestMsg.sendTime,
                    // 系统消息无发送者语义，置 0 避免会话预览携带 "xx:" 前缀
                    last_sender: isSystemNotificationMessage(latestMsg.type) ? 0 : latestMsg.fromUserId
                });
                if (updatedSession) {
                    void sessionService.saveMany([toRaw(updatedSession)]);
                }
            }
        }
    }

    /**
     * 撤回消息：service 只做 I/O，成功后由本层做本地乐观更新并落库
     * （服务端随后广播的 MSG_OP_RECALL 通知会幂等对齐，覆盖多端/其他成员）。
     */
    async function recallMessage(msg: IChatMessage): Promise<boolean> {
        if (!msg.msgId) return false;
        const ok = await chatService.recallMessage(msg.msgId, msg.sessionId);
        if (!ok) return false;

        const updated = messageStore.updateMessageStatus(
            msg.sessionId, msg.msgId, '', ImTypes.MessageStatus.MESSAGE_STATUS_RECALLED,
        );
        if (updated) {
            void messageService.saveMessage(toRaw(updated) as IChatMessage);
        }
        const session = sessionStore.getSession(msg.sessionKey || '')
        if (session && session.max_seq === msg.seq) {
            
        }
        return true;
    }

    return {
        inputText,
        isSending,
        sendTextMessage,
        sendImageMessage,
        sendFileMessage,
        sendVideoMessage,
        loadMore,
        recallMessage
    };
}
