import { defineStore } from 'pinia';
import { useSessionStore } from './session';
import { IChatMessage } from '@shared/types/chatMessage';
import { toRaw } from 'vue';
import { ImTypes, ApiTypes, CacheOptionType } from '@shared/types';
import { APP_CONSTANTS, Renderer_Config } from '@shared/config/constants';
import { ElMessage } from 'element-plus';
import {
    buildTextWsMessage,
    buildImageLocalMsg, buildImageWsPayload,
    buildFileLocalMsg, buildFileWsPayload,
    buildVideoLocalMsg, buildVideoWsPayload,
} from '@/src/utils/messageBuilder';
import { toResourceUrl } from '@/src/utils/resourceUrl';
import { extractVideoFrame } from '@/src/utils/mediaUtils';
import { useUserStore } from './user';
import { seqPositive, toSeq, seqCompare } from '@shared/utils/seq';

// ─── Dependency Injection Interfaces ─────────────────────────────────────────
// Store 不直接依赖任何 Service，所有外部 I/O 能力通过这些接口在调用方注入。

/** 底层 WebSocket 发送能力 */
export interface IMessageSender {
    send(msg: ImTypes.WSMessage, clientId: string, sessionId: string): Promise<any>
}

/** 消息本地持久化能力（写入 SQLite） */
export interface IMessagePersister {
    save(msg: IChatMessage): Promise<void>
}

/** 文件上传能力 */
export interface IFileUploader {
    uploadFile(
        file: File,
        fileType: ApiTypes.file.FileType,
        onProgress: (progress: number) => void
    ): { promise: Promise<string>; abort: () => void }
}

/**
 * 历史消息页：可立即返回的 messages + 可选的后台补齐承诺。
 * reconcile resolve 为补齐后的完整页，由 store 负责并入（service 不触碰 store）。
 */
export interface HistoryPage {
    messages: IChatMessage[]
    reconcile?: Promise<IChatMessage[]>
}

/** 历史消息拉取能力 */
export interface IHistoryFetcher {
    getHistoryMessages(
        sessionKey: string,
        beforeSeq?: string,
        limit?: number,
        sessionMaxSeq?: string,
    ): Promise<HistoryPage>
}

/**
 * 媒体消息发送规格：描述各媒体类型的差异化部分。
 * _sendMediaMessage 通用流水线通过此接口接入具体的消息构建逻辑。
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

// ─────────────────────────────────────────────────────────────────────────────

const uploadAbortControllers = new Map<string, () => void>();

export const useMessageStore = defineStore('message', {
    state: () => ({
        messages: [] as IChatMessage[],
        isLoading: false,
        hasMore: true,
        pageSize: 20,
        /**
         * 会话消息内存缓存：切换会话时暂存当前列表，切回时直接恢复免于重新查库。
         * Map 迭代序即插入序，用作 LRU：命中/写入时先删后插移至队尾，超限淘汰队首。
         */
        sessionMessageCache: new Map<string, { messages: IChatMessage[]; hasMore: boolean }>(),
    }),
    actions: {
        /**
         * 将当前会话的消息列表暂存入缓存（切换会话前调用）
         */
        stashCurrentMessages(sessionKey: string) {
            if (!sessionKey) return;
            if (this.messages.length === 0) {
                this.sessionMessageCache.delete(sessionKey);
                return;
            }
            this.sessionMessageCache.delete(sessionKey);
            this.sessionMessageCache.set(sessionKey, { messages: this.messages, hasMore: this.hasMore });
            while (this.sessionMessageCache.size > Renderer_Config.maxCachedMessageSessions) {
                const oldest = this.sessionMessageCache.keys().next().value;
                if (oldest === undefined) break;
                this.sessionMessageCache.delete(oldest);
            }
        },

        /**
         * 尝试从缓存恢复会话消息，命中返回 true（未命中时由调用方走 reset + 查库流程）
         */
        restoreMessagesFromCache(sessionKey: string): boolean {
            const cached = this.sessionMessageCache.get(sessionKey);
            if (!cached) return false;
            // 刷新 LRU 顺序
            this.sessionMessageCache.delete(sessionKey);
            this.sessionMessageCache.set(sessionKey, cached);
            this.messages = cached.messages;
            this.hasMore = cached.hasMore;
            this.isLoading = false;
            return true;
        },

        /**
         * 失效指定会话的消息缓存
         * （离线补拉绕过内存写库、退群清理等使缓存过期的场景调用）
         */
        invalidateMessageCache(sessionKey: string) {
            this.sessionMessageCache.delete(sessionKey);
        },

        /**
         * 清空全部消息缓存（离开主界面/登出时调用）
         */
        clearMessageCache() {
            this.sessionMessageCache.clear();
        },

        /**
         * 更新文件消息的本地路径（下载完成后使用）
         */
        updateFileLocalPath(sessionkey: string, msgId: string, localPath: string) {
            const sessionStore = useSessionStore();
            if (sessionStore.currentSessionKey !== sessionkey) return;
            const msg = this.messages.find(m =>
                (msgId && m.msgId === msgId)
            ) as any;
            if (msg) {
                msg.localPath = localPath;
            }
        },

        /**
         * 重置当前会话消息状态
         */
        resetMessageState() {
            this.messages = [];
            this.isLoading = false;
            this.hasMore = true;
        },

        /**
         * 更新消息状态（供 Listener 更新服务端返回的 ack / recall 状态使用）
         */
        updateMessageStatus(
            _sessionId: string,
            clientId: string,
            status: number,
            sendTime?: number,
            msgId?: string,
            seq?: string
        ): IChatMessage | undefined {
            const findIn = (list: IChatMessage[]) => list.find(m =>
                (clientId && m.clientId === clientId) ||
                (msgId && m.msgId === msgId)
            );
            let msg = findIn(this.messages);
            if (!msg) {
                // 当前会话未命中：用户可能已切走，ACK/撤回状态仍需落到缓存中的消息上
                for (const cached of this.sessionMessageCache.values()) {
                    msg = findIn(cached.messages);
                    if (msg) break;
                }
            }
            if (msg) {
                msg.status = status;
                if (sendTime) msg.sendTime = sendTime;
                if (msgId) msg.msgId = msgId;
                if (seq && seqPositive(seq)) msg.seq = toSeq(seq);
                if (_sessionId) msg.sessionId = _sessionId;
            }
            return msg;
        },

        /**
         * 添加或更新消息，返回 store 内的消息引用（响应式）
         *
         * messages 数组只承载当前会话：携带 sessionKey 且不属于当前会话的新消息
         * 不入列（异步回调/Listener 到达时用户可能已切换会话），但若该会话有内存
         * 缓存则同步追加进缓存，保证切回时尾部消息不缺失。
         */
        upsertMessage(message: IChatMessage): IChatMessage {
            const existing = this.messages.find(m =>
                (message.clientId && message.clientId === m.clientId) ||
                (message.msgId && message.msgId === m.msgId)
            );
            if (!existing) {
                const sessionStore = useSessionStore();
                if (message.sessionKey && message.sessionKey !== sessionStore.currentSessionKey) {
                    const cached = this.sessionMessageCache.get(message.sessionKey);
                    if (cached) {
                        const cachedExisting = cached.messages.find(m =>
                            (message.clientId && message.clientId === m.clientId) ||
                            (message.msgId && message.msgId === m.msgId)
                        );
                        if (!cachedExisting) cached.messages.push(message);
                    }
                    return message;
                }
                this.messages.push(message);
                return this.messages[this.messages.length - 1];
            } else {
                existing.seq = seqPositive(message.seq) ? toSeq(message.seq) : existing.seq;
                existing.msgId = message.msgId || existing.msgId;
                existing.status = message.status || existing.status;
                existing.sendTime = message.sendTime || existing.sendTime;
                return existing;
            }
        },

        /**
         * 将后台补齐的历史消息并入指定会话（当前列表或内存缓存），按 seq 去重排序。
         * 会话已不在 store（未打开且未缓存）时静默忽略——对应「store 中还有这个会话的 key 才添加」。
         */
        mergeHistoryMessages(sessionKey: string, incoming: IChatMessage[]) {
            if (!sessionKey || incoming.length === 0) return;
            const sessionStore = useSessionStore();
            const target = sessionStore.currentSessionKey === sessionKey
                ? this.messages
                : this.sessionMessageCache.get(sessionKey)?.messages;
            if (!target) return;

            let changed = false;
            for (const msg of incoming) {
                const exists = target.some(m =>
                    (msg.clientId && m.clientId === msg.clientId) ||
                    (msg.msgId && m.msgId === msg.msgId)
                );
                if (!exists) {
                    target.push(msg);
                    changed = true;
                }
            }
            if (!changed) return;

            target.sort((a, b) => {
                if (seqPositive(a.seq) && seqPositive(b.seq)) {
                    const cmp = seqCompare(a.seq, b.seq);
                    if (cmp !== 0) return cmp;
                }
                return (a.sendTime || 0) - (b.sendTime || 0);
            });
        },

        /**
         * 加载更多历史消息
         * @param fetcher  注入的历史消息拉取实现（由调用方传入 chatService）
         */
        async loadMore(sessionKey: string, fetcher: IHistoryFetcher): Promise<IChatMessage[]> {
            if (this.isLoading || !this.hasMore || !sessionKey) return [];

            const oldestConfirmedSeq = (() => {
                for (const msg of this.messages) {
                    if (seqPositive(msg.seq)) return toSeq(msg.seq);
                }
                return undefined;
            })();

            if (this.messages.length > 0 && oldestConfirmedSeq === undefined) {
                this.hasMore = false;
                return [];
            }

            this.isLoading = true;
            try {
                const sessionStore = useSessionStore();
                // 会话 max_seq 由 store 读取后作为入参传入，fetcher（service）不再反向依赖 store
                const maxSeq = sessionStore.getSession(sessionKey)?.max_seq;
                const page = await fetcher.getHistoryMessages(
                    sessionKey,
                    oldestConfirmedSeq,
                    this.pageSize,
                    maxSeq,
                );
                const moreMessages = page.messages;

                if (sessionStore.currentSessionKey !== sessionKey) {
                    return [];
                }

                if (moreMessages.length > 0) {
                    this.messages.unshift(...moreMessages);
                }

                // 本地优先 + 后台补齐策略下，不足一页不代表到顶（可能只是本地这页较小，
                // 更早的由后台/下次翻页补）。仅当整页为空（确无更早消息）时才停止翻页。
                if (moreMessages.length === 0) {
                    this.hasMore = false;
                }

                // 后台补齐承诺 resolve 后由 store 自身并入（会话仍打开/缓存时）——合并逻辑归属 store
                if (page.reconcile) {
                    void page.reconcile.then(fresh => this.mergeHistoryMessages(sessionKey, fresh));
                }

                return moreMessages;
            } catch (e) {
                console.error('[MessageStore] loadMore failed:', e);
                return [];
            } finally {
                const sessionStore = useSessionStore();
                if (sessionStore.currentSessionKey === sessionKey) {
                    this.isLoading = false;
                }
            }
        },

        /**
         * 取消正在进行的上传
         */
        cancelUpload(clientId: string) {
            const abort = uploadAbortControllers.get(clientId);
            if (abort) {
                abort();
                uploadAbortControllers.delete(clientId);
            }
        },

        /**
         * 发送文本消息
         * @param deps.sender     注入 websocketService
         * @param deps.persister  注入 messageService
         */
        async sendTextMessage(
            content: string,
            deps: { sender: IMessageSender; persister: IMessagePersister }
        ): Promise<IChatMessage> {
            const sessionStore = useSessionStore();
            const userStore = useUserStore();
            const chatType = sessionStore.currentSessionType;
            const sessionKey = sessionStore.currentSessionKey;
            const session = sessionStore.getSession(sessionKey);
            const sessionId = session?.session_id || '';

            const { msg, clientId, localMsg } = buildTextWsMessage(content, sessionId, sessionKey, chatType, userStore.getUserID());
            const storedMsg = this.upsertMessage(localMsg);

            try {
                const result = await deps.sender.send(msg, clientId, sessionId);
                if (!result.success || !result.data?.sent) {
                    storedMsg.status = ImTypes.MessageStatus.MESSAGE_STATUS_FAILED;
                }
            } catch (e) {
                console.error('[MessageStore] sendTextMessage failed:', e);
                storedMsg.status = ImTypes.MessageStatus.MESSAGE_STATUS_FAILED;
            } finally {
                await deps.persister.save(toRaw(storedMsg) as IChatMessage);
            }
            return storedMsg;
        },

        /**
         * 媒体消息发送通用流水线（内部模板方法）
         * 封装上传、WS 发送、错误处理、SQLite 落库等公共步骤。
         * 具体消息类型通过 MediaMessageSpec 注入差异化逻辑。
         */
        async _sendMediaMessage(
            spec: MediaMessageSpec,
            logTag: string,
            deps: { uploader: IFileUploader; sender: IMessageSender; persister: IMessagePersister }
        ): Promise<IChatMessage | undefined> {
            const sessionStore = useSessionStore();
            const userStore = useUserStore();
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
            const storedMsg = this.upsertMessage(localMsg) as any;

            try {
                const { promise, abort } = deps.uploader.uploadFile(
                    spec.file,
                    spec.fileType,
                    (progress) => { storedMsg.uploadProgress = progress; }
                );
                uploadAbortControllers.set(clientId, abort);

                const ossUrl = await promise;
                uploadAbortControllers.delete(clientId);
                storedMsg.url = ossUrl;

                const finalMsg = spec.buildWsPayload(localMsg, ossUrl, sessionId, sessionKey, chatType, userId);
                const result = await deps.sender.send(finalMsg, clientId, sessionId);
                if (!result.success || !result.data?.sent) {
                    storedMsg.status = ImTypes.MessageStatus.MESSAGE_STATUS_FAILED;
                }
            } catch (e) {
                console.error(`[MessageStore] ${logTag} failed:`, e);
                storedMsg.status = ImTypes.MessageStatus.MESSAGE_STATUS_FAILED;
                storedMsg.uploadProgress = 0;
                uploadAbortControllers.delete(clientId);
            } finally {
                await deps.persister.save(toRaw(storedMsg) as IChatMessage);
            }
            return storedMsg;
        },

        /**
         * 发送图片消息
         * @param deps.uploader   注入 fileService
         * @param deps.sender     注入 websocketService
         * @param deps.persister  注入 messageService
         */
        async sendImageMessage(
            file: File,
            deps: { uploader: IFileUploader; sender: IMessageSender; persister: IMessagePersister }
        ): Promise<IChatMessage | undefined> {
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

            return this._sendMediaMessage({
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
            }, 'sendImageMessage', deps);
        },

        /**
         * 发送文件消息
         * @param deps.uploader   注入 fileService
         * @param deps.sender     注入 websocketService
         * @param deps.persister  注入 messageService
         */
        async sendFileMessage(
            file: File,
            deps: { uploader: IFileUploader; sender: IMessageSender; persister: IMessagePersister }
        ): Promise<IChatMessage | undefined> {
            const filePath = window.webUtils.getPathForFile(file);

            return this._sendMediaMessage({
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
            }, 'sendFileMessage', deps);
        },

        /**
         * 发送视频消息
         * @param deps.uploader   注入 fileService
         * @param deps.sender     注入 websocketService
         * @param deps.persister  注入 messageService
         */
        async sendVideoMessage(
            file: File,
            deps: { uploader: IFileUploader; sender: IMessageSender; persister: IMessagePersister }
        ): Promise<IChatMessage | undefined> {
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

            return this._sendMediaMessage({
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
            }, 'sendVideoMessage', deps);
        },
    },
});
