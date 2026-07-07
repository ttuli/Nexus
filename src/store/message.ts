import { defineStore } from 'pinia';
import { useSessionStore } from './session';
import { IChatMessage } from '@shared/types/chatMessage';
import { toRaw } from 'vue';
import { ImTypes, ApiTypes, CacheOptionType } from '@shared/types';
import { APP_CONSTANTS } from '@shared/config/constants';
import { ElMessage } from 'element-plus';
import {
    buildTextWsMessage,
    buildImageLocalMsg, buildImageWsPayload,
    buildFileLocalMsg, buildFileWsPayload,
    buildVideoLocalMsg, buildVideoWsPayload,
} from '@/src/utils/messageBuilder';
import { toResourceUrl } from '@/src/utils/resourceUrl';
import { extractVideoFrame } from '@/src/utils/mediaUtils';

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

/** 历史消息拉取能力 */
export interface IHistoryFetcher {
    getHistoryMessages(
        sessionKey: string,
        beforeSeq?: number,
        limit?: number
    ): Promise<IChatMessage[]>
}

// ─────────────────────────────────────────────────────────────────────────────

const uploadAbortControllers = new Map<string, () => void>();

export const useMessageStore = defineStore('message', {
    state: () => ({
        messages: [] as IChatMessage[],
        isLoading: false,
        hasMore: true,
        pageSize: 20
    }),
    actions: {
        /**
         * 更新文件消息的本地路径（下载完成后使用）
         */
        updateFileLocalPath(sessionkey: string, msgId: string, localPath: string) {
            const conversationStore = useSessionStore();
            if (conversationStore.currentSessionKey !== sessionkey) return;
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
            seq?: number
        ): IChatMessage | undefined {
            const msg = this.messages.find(m =>
                (clientId && m.clientId === clientId) ||
                (msgId && m.msgId === msgId)
            );
            if (msg) {
                msg.status = status;
                if (sendTime) msg.sendTime = sendTime;
                if (msgId) msg.msgId = msgId;
                if (seq) msg.seq = seq;
                if (_sessionId) msg.sessionId = _sessionId;
            }
            return msg;
        },

        /**
         * 添加或更新消息，返回 store 内的消息引用（响应式）
         */
        upsertMessage(message: IChatMessage): IChatMessage {
            const existing = this.messages.find(m =>
                (message.clientId && message.clientId === m.clientId) ||
                (message.msgId && message.msgId === m.msgId)
            );
            if (!existing) {
                this.messages.push(message);
                return this.messages[this.messages.length - 1];
            } else {
                existing.seq = message.seq || existing.seq;
                existing.msgId = message.msgId || existing.msgId;
                existing.status = message.status || existing.status;
                existing.sendTime = message.sendTime || existing.sendTime;
                return existing;
            }
        },

        /**
         * 加载更多历史消息
         * @param fetcher  注入的历史消息拉取实现（由调用方传入 chatService）
         */
        async loadMore(sessionKey: string, fetcher: IHistoryFetcher): Promise<IChatMessage[]> {
            if (this.isLoading || !this.hasMore || !sessionKey) return [];

            const oldestConfirmedSeq = (() => {
                for (const msg of this.messages) {
                    const seq = Number(msg.seq);
                    if (Number.isFinite(seq) && seq > 0) return seq;
                }
                return null;
            })();

            if (this.messages.length > 0 && oldestConfirmedSeq === null) {
                this.hasMore = false;
                return [];
            }

            this.isLoading = true;
            try {
                const moreMessages = await fetcher.getHistoryMessages(
                    sessionKey,
                    oldestConfirmedSeq ?? undefined,
                    this.pageSize
                );

                const sessionStore = useSessionStore();
                if (sessionStore.currentSessionKey !== sessionKey) {
                    return [];
                }

                if (moreMessages.length > 0) {
                    this.messages.unshift(...moreMessages);
                }

                if (moreMessages.length < this.pageSize) {
                    this.hasMore = false;
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
        ): Promise<void> {
            const sessionStore = useSessionStore();
            const chatType = sessionStore.currentSessionType;
            const sessionKey = sessionStore.currentSessionKey;
            const session = sessionStore.getSession(sessionKey);
            const sessionId = session?.session_id || '';

            const { msg, clientId, localMsg } = buildTextWsMessage(content, sessionKey, chatType);
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
        ): Promise<void> {
            const sessionStore = useSessionStore();
            const sessionKey = sessionStore.currentSessionKey;
            const session = sessionStore.getSession(sessionKey);
            if (!session) {
                ElMessage.error('获取会话失败');
                return;
            }
            const sessionId = session.session_id || '';
            const chatType = session.type;

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

            const { clientId, localMsg } = buildImageLocalMsg({
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
            }, sessionKey, chatType);
            const storedMsg = this.upsertMessage(localMsg) as any;

            try {
                const { promise, abort } = deps.uploader.uploadFile(
                    file,
                    ApiTypes.file.FileType.FileTypeChatImage,
                    (progress) => { storedMsg.uploadProgress = progress; }
                );
                uploadAbortControllers.set(clientId, abort);

                const ossUrl = await promise;
                uploadAbortControllers.delete(clientId);
                storedMsg.url = ossUrl;

                const finalMsg = buildImageWsPayload(
                    { ...localMsg, localPath: undefined, thumbnailUrl: undefined },
                    ossUrl,
                    sessionKey,
                    chatType
                );
                const result = await deps.sender.send(finalMsg, clientId, sessionId);
                if (!result.success || !result.data?.sent) {
                    storedMsg.status = ImTypes.MessageStatus.MESSAGE_STATUS_FAILED;
                }
            } catch (e) {
                console.error('[MessageStore] sendImageMessage failed:', e);
                storedMsg.status = ImTypes.MessageStatus.MESSAGE_STATUS_FAILED;
                storedMsg.uploadProgress = 0;
                uploadAbortControllers.delete(clientId);
            } finally {
                await deps.persister.save(toRaw(storedMsg) as IChatMessage);
            }
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
        ): Promise<void> {
            const sessionStore = useSessionStore();
            const sessionKey = sessionStore.currentSessionKey;
            const session = sessionStore.getSession(sessionKey);
            if (!session) {
                ElMessage.error('获取会话失败');
                return;
            }
            const sessionId = session.session_id || '';
            const chatType = session.type;

            const filePath = window.webUtils.getPathForFile(file);

            const { clientId, localMsg } = buildFileLocalMsg({
                url: '',
                localPath: filePath,
                uploadProgress: 0,
                fileName: file.name,
                size: file.size,
                format: file.type,
            }, sessionKey, chatType);
            const storedMsg = this.upsertMessage(localMsg) as any;

            try {
                const { promise, abort } = deps.uploader.uploadFile(
                    file,
                    ApiTypes.file.FileType.FileTypeChatFile,
                    (progress) => { storedMsg.uploadProgress = progress; }
                );
                uploadAbortControllers.set(clientId, abort);

                const ossUrl = await promise;
                uploadAbortControllers.delete(clientId);
                storedMsg.url = ossUrl;

                const finalMsg = buildFileWsPayload(localMsg, ossUrl, sessionKey, chatType);
                const result = await deps.sender.send(finalMsg, clientId, sessionId);
                if (!result.success || !result.data?.sent) {
                    storedMsg.status = ImTypes.MessageStatus.MESSAGE_STATUS_FAILED;
                }
            } catch (e) {
                console.error('[MessageStore] sendFileMessage failed:', e);
                storedMsg.status = ImTypes.MessageStatus.MESSAGE_STATUS_FAILED;
                storedMsg.uploadProgress = 0;
                uploadAbortControllers.delete(clientId);
            } finally {
                await deps.persister.save(toRaw(storedMsg) as IChatMessage);
            }
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
        ): Promise<void> {
            const sessionStore = useSessionStore();
            const sessionKey = sessionStore.currentSessionKey;
            const session = sessionStore.getSession(sessionKey);
            if (!session) {
                ElMessage.error('获取会话失败');
                return;
            }
            const sessionId = session.session_id || '';
            const chatType = session.type;

            const videoMeta = await extractVideoFrame(file);
            const filePath = window.webUtils.getPathForFile(file);

            let thumbnailWidth = videoMeta.width;
            let thumbnailHeight = videoMeta.height;
            if (videoMeta.width > APP_CONSTANTS.maxImageWidth || videoMeta.height > APP_CONSTANTS.maxImageHeight) {
                const ratio = Math.min(APP_CONSTANTS.maxImageWidth / videoMeta.width, APP_CONSTANTS.maxImageHeight / videoMeta.height);
                thumbnailWidth = Math.round(videoMeta.width * ratio);
                thumbnailHeight = Math.round(videoMeta.height * ratio);
            }

            const { clientId, localMsg } = buildVideoLocalMsg({
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
            }, sessionKey, chatType);
            const storedMsg = this.upsertMessage(localMsg) as any;

            try {
                const { promise, abort } = deps.uploader.uploadFile(
                    file,
                    ApiTypes.file.FileType.FileTypeChatFile,
                    (progress) => { storedMsg.uploadProgress = progress; }
                );
                uploadAbortControllers.set(clientId, abort);

                const ossUrl = await promise;
                uploadAbortControllers.delete(clientId);
                storedMsg.url = ossUrl;

                const finalMsg = buildVideoWsPayload(
                    { ...localMsg, localPath: undefined, thumbnailUrl: undefined },
                    ossUrl,
                    sessionKey,
                    chatType
                );
                const result = await deps.sender.send(finalMsg, clientId, sessionId);
                if (!result.success || !result.data?.sent) {
                    storedMsg.status = ImTypes.MessageStatus.MESSAGE_STATUS_FAILED;
                }
            } catch (e) {
                console.error('[MessageStore] sendVideoMessage failed:', e);
                storedMsg.status = ImTypes.MessageStatus.MESSAGE_STATUS_FAILED;
                storedMsg.uploadProgress = 0;
                uploadAbortControllers.delete(clientId);
            } finally {
                await deps.persister.save(toRaw(storedMsg) as IChatMessage);
            }
        },

        /**
         * 接收并处理新消息（纯状态操作，同步执行）
         *
         * 将持久化（saveMessage）、提示音（playNotificationSound）等副作用
         * 完全交还给调用方（wsMessageListener）处理，Store 只负责状态更新。
         *
         * @param lastContent     已由调用方预计算的会话摘要文本
         * @param incrementUnread 是否需要增加未读计数（对方发送的消息传 true，自己发送的传 false）
         * @returns               更新后的 Session 对象，供调用方决定是否持久化
         */
        receiveMessage(
            message: IChatMessage,
            lastContent: string,
            incrementUnread: boolean
        ): ImTypes.Session | undefined {
            const sessionStore = useSessionStore();

            // 1. 如果是当前活跃会话，写入聊天消息流以更新 UI
            if (sessionStore.currentSessionKey === message.sessionKey) {
                this.upsertMessage(message);
            }

            // 2. 更新会话列表中对应的会话项摘要
            const updatedSession = sessionStore.upsertSession({
                session_key: message.sessionKey as string,
                session_id: message.sessionId,
                max_seq: message.seq,
                last_content: lastContent,
                last_sender: message.fromUserId,
                update_time: message.sendTime,
            });

            // 3. 按需增加未读计数
            if (incrementUnread) {
                sessionStore.incrementUnread(message.sessionKey as string);
            }

            return updatedSession ?? undefined;
        }
    }
});
