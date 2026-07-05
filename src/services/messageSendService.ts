import { useSessionStore } from '@/src/store/session';
import { useMessageStore } from '@/src/store/message';
import { ApiTypes, ImTypes, CacheOptionType, IpcChannels } from '@/src/types';
import { ILocalImageMessage, ILocalFileMessage, ILocalVideoMessage } from '@/src/types/chatMessage';
import { websocketService } from './websocketService';
import { fileService } from './fileService';
import { ipcService } from '.';
import { APP_CONSTANTS } from '@/src/config/constants';
import { toResourceUrl } from '@/src/utils/resourceUrl';
import { buildTextWsMessage, buildImageLocalMsg, buildImageWsPayload, buildFileLocalMsg, buildFileWsPayload, buildVideoLocalMsg, buildVideoWsPayload } from '@/src/utils/messageBuilder';
import { extractVideoFrame } from '@/src/utils/mediaUtils';
import { ElMessage } from 'element-plus';

class MessageSendService {
    private uploadAbortControllers: Map<string, () => void> = new Map();

    /**
     * 取消上传
     */
    cancelUpload(clientId: string) {
        const abort = this.uploadAbortControllers.get(clientId);
        if (abort) {
            abort();
            this.uploadAbortControllers.delete(clientId);
        }
    }

    /**
     * 构建并发送文本消息
     */
    async sendTextMessage(content: string): Promise<void> {
        const sessionStore = useSessionStore();
        const messageStore = useMessageStore();
        const chatType = sessionStore.currentSessionType;
        const sessionKey = sessionStore.currentSessionKey;
        const session = sessionStore.getSession(sessionKey);
        const sessionId = session?.session_id || '';

        const { msg, clientId, localMsg } = buildTextWsMessage(content, sessionKey, chatType);
        const storedMsg = messageStore.upsertMessage(localMsg);

        try {
            const result = await websocketService.send(msg, clientId, sessionId);
            if (!result.success || !result.data?.sent) {
                storedMsg.status = ImTypes.MessageStatus.MESSAGE_STATUS_FAILED;
            }
        } catch (e) {
            console.error('[MessageSendService] sendTextMessage failed:', e);
            storedMsg.status = ImTypes.MessageStatus.MESSAGE_STATUS_FAILED;
        } finally {
            ipcService.invoke(IpcChannels.MSG_SAVE, JSON.parse(JSON.stringify(storedMsg)));
        }
    }

    /**
     * 构建并发送图片消息
     */
    async sendImageMessage(file: File): Promise<void> {
        const sessionStore = useSessionStore();
        const messageStore = useMessageStore();

        const session = sessionStore.getSession(sessionStore.currentSessionKey);
        if (!session) {
            ElMessage.error('获取会话失败')
            return;
        }
        const sessionKey = sessionStore.currentSessionKey;
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
        const storedMsg = messageStore.upsertMessage(localMsg) as ILocalImageMessage;

        try {
            const { promise, abort } = fileService.uploadFile(
                file,
                ApiTypes.file.FileType.FileTypeChatImage,
                (progress) => {
                    storedMsg.uploadProgress = progress;
                }
            );
            this.uploadAbortControllers.set(clientId, abort);

            const ossUrl = await promise;
            this.uploadAbortControllers.delete(clientId);
            
            storedMsg.url = ossUrl;

            let localMsg_copy = { ...localMsg };
            localMsg_copy.localPath = undefined;
            localMsg_copy.thumbnailUrl = undefined;

            const finalMsg = buildImageWsPayload(localMsg_copy, ossUrl, sessionKey, chatType);
            const result = await websocketService.send(finalMsg, clientId, sessionId);
            if (!result.success || !result.data?.sent) {
                storedMsg.status = ImTypes.MessageStatus.MESSAGE_STATUS_FAILED;
            }
            
            ipcService.invoke(IpcChannels.MSG_SAVE, JSON.parse(JSON.stringify(storedMsg)));
        } catch (e) {
            console.error('[MessageSendService] sendImageMessage failed:', e);
            storedMsg.status = ImTypes.MessageStatus.MESSAGE_STATUS_FAILED;
            storedMsg.uploadProgress = 0;
            this.uploadAbortControllers.delete(clientId);
        }
    }

    /**
     * 构建并发送文件消息
     */
    async sendFileMessage(file: File): Promise<void> {
        const sessionStore = useSessionStore();
        const messageStore = useMessageStore();
        const session = sessionStore.getSession(sessionStore.currentSessionKey);
        if (!session) {
            ElMessage.error('获取会话失败')
            return;
        }
        const sessionKey = sessionStore.currentSessionKey;
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
        const storedMsg = messageStore.upsertMessage(localMsg) as ILocalFileMessage;

        try {
            const { promise, abort } = fileService.uploadFile(
                file,
                ApiTypes.file.FileType.FileTypeChatFile,
                (progress) => {
                    storedMsg!.uploadProgress = progress;
                }
            );
            this.uploadAbortControllers.set(clientId, abort);

            const ossUrl = await promise;
            this.uploadAbortControllers.delete(clientId);
            
            storedMsg!.url = ossUrl;

            const finalMsg = buildFileWsPayload(localMsg, ossUrl, sessionKey, chatType);
            const result = await websocketService.send(finalMsg, clientId, sessionId);
            if (!result.success || !result.data?.sent) {
                storedMsg.status = ImTypes.MessageStatus.MESSAGE_STATUS_FAILED;
            }
            
            ipcService.invoke(IpcChannels.MSG_SAVE, JSON.parse(JSON.stringify(storedMsg)));
        } catch (e) {
            console.error('[MessageSendService] sendFileMessage failed:', e);
            storedMsg.status = ImTypes.MessageStatus.MESSAGE_STATUS_FAILED;
            storedMsg.uploadProgress = 0;
            this.uploadAbortControllers.delete(clientId);
        }
    }

    /**
     * 构建并发送视频消息
     */
    async sendVideoMessage(file: File): Promise<void> {
        const sessionStore = useSessionStore();
        const messageStore = useMessageStore();
        const session = sessionStore.getSession(sessionStore.currentSessionKey);
        if (!session) {
            ElMessage.error('获取会话失败')
            return;
        }
        const sessionKey = sessionStore.currentSessionKey;
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
        const storedMsg = messageStore.upsertMessage(localMsg) as ILocalVideoMessage;

        try {
            const { promise, abort } = fileService.uploadFile(
                file,
                ApiTypes.file.FileType.FileTypeChatFile,
                (progress) => {
                    storedMsg!.uploadProgress = progress
                }
            );
            this.uploadAbortControllers.set(clientId, abort);

            const ossUrl = await promise;
            this.uploadAbortControllers.delete(clientId);

            storedMsg!.url = ossUrl;

            let localMsg_copy = { ...localMsg };
            localMsg_copy.localPath = undefined;
            localMsg_copy.thumbnailUrl = undefined;

            const finalMsg = buildVideoWsPayload(localMsg_copy, ossUrl, sessionKey, chatType);
            const result = await websocketService.send(finalMsg, clientId, sessionId);
            if (!result.success || !result.data?.sent) {
                storedMsg.status = ImTypes.MessageStatus.MESSAGE_STATUS_FAILED;
            }
            
            ipcService.invoke(IpcChannels.MSG_SAVE, JSON.parse(JSON.stringify(storedMsg)));
        } catch (e) {
            console.error('[MessageSendService] sendVideoMessage failed:', e);
            storedMsg.status = ImTypes.MessageStatus.MESSAGE_STATUS_FAILED;
            storedMsg.uploadProgress = 0;
            this.uploadAbortControllers.delete(clientId);
        }
    }

}

export const messageSendService = new MessageSendService();
export default messageSendService;
