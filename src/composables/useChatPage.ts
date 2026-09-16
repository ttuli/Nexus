import { ref, toRaw, reactive } from 'vue';
import { ImTypes, ApiTypes, CacheOptionType } from '@shared/types';
import type { IChatMessage } from '@shared/types/chatMessage';
import { APP_CONSTANTS } from '@shared/config/constants';
import { ElMessage } from 'element-plus';
import { useSessionStore } from '@/src/store/session';
import { useMessageStore } from '@/src/store/message';
import { useUserStore } from '@/src/store/user';
import type { IHistoryFetcher } from '@/src/store/message';
import { getLastContent } from '@/src/utils/messageConverter';
import {
    buildTextWsMessage,
    buildImageLocalMsg, buildImageWsPayload,
    buildFileLocalMsg, buildFileWsPayload,
    buildVideoLocalMsg, buildVideoWsPayload,
} from '@/src/utils/messageBuilder';
import { toResourceUrl } from '@/src/utils/resourceUrl';
import { extractVideoFrame } from '@/src/utils/mediaUtils';
import { seqGt, seqPositive } from '@shared/utils/seq';

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
 * 撤回在途标记（响应式 Set）：防双击/并发重复撤回，二次触发静默忽略。
 * 包装为 reactive 以便 Vue 组件能实时响应撤回动画与加载状态。
 */
const recallingMsgIds = reactive(new Set<string>());

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
     * 加载更多历史消息（向上翻页拉取更旧的消息）。
     * 不更新会话摘要：会话预览恒表示"最新"一条，由发送 / 接收 / 离线同步维护；
     * 本函数拿到的是更旧的历史页，用它覆盖 last_content 会把预览刷回旧消息。
     */
    async function loadMore() {
        const sessionKey = sessionStore.currentSessionKey;
        if (!sessionKey) return;
        // 将 chatService 作为 fetcher 注入
        await messageStore.loadMore(sessionKey, fetcher);
    }

    /**
     * 撤回消息：service 只做 I/O，成功后由本层做本地乐观更新并落库
     * （服务端随后广播的 MSG_OP_RECALL 通知会幂等对齐，覆盖多端/其他成员）。
     */
    async function recallMessage(msg: IChatMessage): Promise<boolean> {
        if (!msg.msgId) return false;
        // 在途去重：同一消息的撤回请求未返回前，重复触发直接忽略
        if (recallingMsgIds.has(msg.msgId)) return false;
        recallingMsgIds.add(msg.msgId);
        try {
            const ok = await chatService.recallMessage(msg.msgId, msg.sessionId);
            if (!ok) return false;

            const updated = messageStore.updateMessageStatus(
                msg.sessionId, msg.msgId, '', ImTypes.MessageStatus.MESSAGE_STATUS_RECALLED,
            );
            if (updated) {
                void messageService.saveMessage(toRaw(updated) as IChatMessage);
            }

            // 撤回的是会话最新一条（max_seq 尚未越过该消息 seq）时同步刷新会话预览。
            // 私聊的撤回通知只投递给对端，发送方本地必须自行更新；
            // 群聊通知回环到达后由 listener 同一套判断幂等覆盖。
            const sessionKey = msg.sessionKey || sessionStore.currentSessionKey;
            const session = sessionStore.getSession(sessionKey);
            if (session && seqPositive(msg.seq) && !seqGt(session.max_seq, msg.seq)) {
                const recalled = updated ?? { ...msg, status: ImTypes.MessageStatus.MESSAGE_STATUS_RECALLED };
                const updatedSession = sessionStore.updateSessionSummary(sessionKey, {
                    last_content: getLastContent(recalled, userStore.userID, (id) => userStore.getDisplayName(id)),
                    last_message_time: Date.now(),
                    // 撤回预览文案已含操作者语义（"你撤回了…"），置 0 避免会话卡片再加 "xx:" 前缀
                    last_sender: 0,
                });
                if (updatedSession) {
                    void sessionService.saveMany([toRaw(updatedSession)]);
                }
            }
            return true;
        } finally {
            recallingMsgIds.delete(msg.msgId);
        }
    }

    /**
     * 删除消息后重算会话预览。
     *
     * 不传 last_message_time：新的「最后一条」必然早于被删的那条，而内存层
     * updateSessionSummary 与 sessions 表的 SQL 都对 last_message_time 做单调门控，
     * 传更小的值会被挡掉、连带 last_content 一起写不进去。保持原值可让门控以
     * 「相等」放行，同时会话在列表中的位置不跳动。
     */
    async function refreshSummaryAfterDelete(sessionKey: string) {
        const latest = await messageService.getLatestMessage(sessionKey);
        const isRecalled = latest?.status === ImTypes.MessageStatus.MESSAGE_STATUS_RECALLED;
        const updatedSession = sessionStore.updateSessionSummary(sessionKey, {
            last_content: latest
                ? getLastContent(latest, userStore.userID, (id) => userStore.getDisplayName(id))
                : '',
            // 撤回预览文案已含操作者语义（"你撤回了…"），置 0 避免会话卡片再加 "xx:" 前缀；
            // 会话已无消息时同样置 0
            last_sender: latest && !isRecalled ? latest.fromUserId : 0,
        });
        if (updatedSession) {
            void sessionService.saveMany([toRaw(updatedSession)]);
        }
    }

    /**
     * 删除消息（纯本地，服务端无删除接口）。
     *
     * DB 侧在删行的同时记墓碑，避免翻页回源时被服务端重新下发。
     */
    async function deleteMessage(msg: IChatMessage): Promise<boolean> {
        const sessionKey = msg.sessionKey || sessionStore.currentSessionKey;
        const msgId = msg.msgId || '';
        const clientId = msg.clientId || '';
        if (!sessionKey || (!msgId && !clientId)) return false;

        // 删正在上传的消息：先掐断在途上传，否则上传完成后的回填会去更新一条已不存在的消息
        if (clientId) cancelUpload(clientId);

        const removedFromDb = await messageService.deleteMessage(sessionKey, msgId, clientId);
        // 即便 DB 未命中（如尚未落库的乐观消息）也要清内存，否则 UI 上残留
        const removedFromMemory = messageStore.removeMessage(msgId, clientId);
        if (!removedFromDb && !removedFromMemory) return false;

        await refreshSummaryAfterDelete(sessionKey);
        return true;
    }

    function isRecalling(msgId?: string): boolean {
        if (!msgId) return false;
        return recallingMsgIds.has(msgId);
    }

    return {
        inputText,
        isSending,
        sendTextMessage,
        sendImageMessage,
        sendFileMessage,
        sendVideoMessage,
        loadMore,
        recallMessage,
        deleteMessage,
        recallingMsgIds,
        isRecalling,
    };
}