import { ipcService } from './ipcService'
import { IpcChannels, IpcResponse, ImTypes, ApiTypes } from '../types'
import { ILocalImageMessage, ILocalFileMessage, ILocalVideoMessage } from '@/types/chatMessage'
import { buildTextWsMessage, buildImageLocalMsg, 
    buildImageWsPayload, buildFileLocalMsg, buildFileWsPayload, 
    buildVideoLocalMsg, buildVideoWsPayload, extractVideoFrame, toLocalPreviewUrl, 
    toLocalPreviewUrlRaw} from '@/utils/chat'
import { useChatStore } from '@/store/chat'
import { fileService } from './fileService'
import { messageStorageService } from './messageStorageService'
import { APP_CONSTANTS } from '@/config/constants'

/**
 * WebSocket 连接状态
 */
export enum WebSocketState {
    CONNECTING = 0,
    OPEN = 1,
    CLOSING = 2,
    CLOSED = 3,
}

export type WsMessage = ImTypes.WSMessage

export interface WebSocketStateResponse extends IpcResponse {
    state: WebSocketState
    pendingCount: number
}

class WebSocketService {
    // 存储上传任务的取消函数
    private uploadAbortControllers: Map<string, () => void> = new Map();
    /**
     * 连接 WebSocket
     */
    async connect(): Promise<IpcResponse> {
        return ipcService.invoke(IpcChannels.WS_CONNECT)
    }

    /**
     * 发送消息
     */
    async send(message: ImTypes.WSMessage, clientId = '', sessionId = ''): Promise<IpcResponse & { sent?: boolean, error?: string }> {
        return ipcService.invoke(IpcChannels.WS_SEND, message, clientId, sessionId)
    }

    /**
     * 发送文本消息
     */
    async sendText(content: string): Promise<void> {
        const chatStore = useChatStore()
        const sessionId = chatStore.currentSessionId

        const { msg, clientId, localMsg } = buildTextWsMessage(content, sessionId)
        chatStore.addMessage(localMsg)

        const result = await this.send(msg, clientId, sessionId)
        if (!result.success || !result.data?.sent) {
            chatStore.updateMessageStatus(
                sessionId, clientId,
                ImTypes.MessageStatus.MESSAGE_STATUS_FAILED, Date.now()
            )
        }
    }

    /**
     * 发送图片消息
     * 流程：先展示本地预览 + 进度条，上传 OSS 完成后再发 WS 消息
     */
    async sendImage(file: File): Promise<void> {
        const chatStore = useChatStore()
        const sessionId = chatStore.currentSessionId

        // 1. 提取图片宽高（用于气泡尺寸计算）
        const bitmap = await createImageBitmap(file)
        const imgWidth = bitmap.width
        const imgHeight = bitmap.height
        
        let thumbnailWidth = imgWidth
        let thumbnailHeight = imgHeight
        if (imgWidth > APP_CONSTANTS.maxImageWidth || imgHeight > APP_CONSTANTS.maxImageHeight) {
            const ratio = Math.min(APP_CONSTANTS.maxImageWidth / imgWidth, APP_CONSTANTS.maxImageHeight / imgHeight)
            thumbnailWidth = Math.round(imgWidth * ratio)
            thumbnailHeight = Math.round(imgHeight * ratio)
        }
        bitmap.close()
        const filePath = window.webUtils.getPathForFile(file);

        // 2. 初始化占位消息（仅需本地消息，不需要 WS payload）
        const { clientId, localMsg } = buildImageLocalMsg({
            url: '',
            localPath: filePath,
            uploadProgress: 0,
            width: imgWidth,
            height: imgHeight,  
            thumbnailWidth: thumbnailWidth,
            thumbnailHeight: thumbnailHeight,
            size: file.size,
            format: file.type,
            thumbnailUrl: toLocalPreviewUrl(filePath, thumbnailWidth, thumbnailHeight),
            fileName: file.name
        }, sessionId)
        chatStore.addMessage(localMsg)

        try {
            // 3. 上传到 OSS，实时更新进度
            const { promise, abort } = fileService.uploadFile(
                file,
                ApiTypes.file.FileType.FileTypeChatImage,
                (progress) => chatStore.updateMessageProgress(sessionId, clientId, progress)
            )
            this.uploadAbortControllers.set(clientId, abort);

            const ossUrl = await promise;
            this.uploadAbortControllers.delete(clientId);

            // 4. 更新 store 中占位消息的 OSS URL，并持久化到 DB
            const storedMsg = chatStore.messages.find(m => m.clientId === clientId) as ILocalImageMessage | undefined
            if (storedMsg) {
                storedMsg.url = ossUrl
                void messageStorageService.saveMessage(storedMsg).catch(e =>
                    console.error('[WebSocketService] Failed to persist image ossUrl:', e)
                )
            }

            let localMsg_copy = { ...localMsg }
            localMsg_copy.localPath = undefined
            localMsg_copy.thumbnailUrl = undefined
            // 5. 用 buildImageWsPayload 直接从已有本地消息拼装 WS 载荷，不再重复所有内容
            const finalMsg = buildImageWsPayload(localMsg_copy, ossUrl, sessionId)
            const result = await this.send(finalMsg, clientId, sessionId)
            if (!result.success || !result.data?.sent) {
                chatStore.updateMessageStatus(
                    sessionId, clientId,
                    ImTypes.MessageStatus.MESSAGE_STATUS_FAILED, Date.now()
                )
            }
        } catch (e) {
            console.error('[WebSocketService] sendImage failed:', e)
            chatStore.updateMessageStatus(
                sessionId, clientId,
                ImTypes.MessageStatus.MESSAGE_STATUS_FAILED, Date.now()
            )
            chatStore.updateMessageProgress(sessionId, clientId, undefined)
            this.uploadAbortControllers.delete(clientId);
        }
    }

    /**
     * 发送文件消息
     * 流程：先展示占位消息（带进度），上传 OSS 完成后再发 WS 消息
     */
    async sendFile(file: File): Promise<void> {
        const chatStore = useChatStore()
        const sessionId = chatStore.currentSessionId
        const filePath = window.webUtils.getPathForFile(file);
        // 1. 构建本地占位消息并立即上屏
        const { clientId, localMsg } = buildFileLocalMsg({
            url: '',
            localPath: filePath,
            uploadProgress: 0,
            fileName: file.name,
            size: file.size,
            format: file.type,
        }, sessionId)
        chatStore.addMessage(localMsg)

        try {
            // 2. 上传到 OSS，实时更新进度
            const { promise, abort } = fileService.uploadFile(
                file,
                ApiTypes.file.FileType.FileTypeChatFile,
                (progress) => chatStore.updateMessageProgress(sessionId, clientId, progress)
            )
            this.uploadAbortControllers.set(clientId, abort);

            const ossUrl = await promise;
            this.uploadAbortControllers.delete(clientId);

            // 3. 更新 store 中占位消息的 OSS URL 并持久化
            const storedMsg = chatStore.messages.find(m => m.clientId === clientId) as ILocalFileMessage | undefined
            if (storedMsg) {
                storedMsg.url = ossUrl
                void messageStorageService.saveMessage(storedMsg).catch(e =>
                    console.error('[WebSocketService] Failed to persist file ossUrl:', e)
                )
            }

            // 4. 用 buildFileWsPayload 从已有本地消息拼装 WS 载荷并发送
            const finalMsg = buildFileWsPayload(localMsg, ossUrl, sessionId)
            const result = await this.send(finalMsg, clientId, sessionId)
            if (!result.success || !result.data?.sent) {
                chatStore.updateMessageStatus(
                    sessionId, clientId,
                    ImTypes.MessageStatus.MESSAGE_STATUS_FAILED, Date.now()
                )
            }
        } catch (e) {
            console.error('[WebSocketService] sendFile failed:', e)
            chatStore.updateMessageStatus(
                sessionId, clientId,
                ImTypes.MessageStatus.MESSAGE_STATUS_FAILED, Date.now()
            )
            chatStore.updateMessageProgress(sessionId, clientId, undefined)
            this.uploadAbortControllers.delete(clientId);
        }
    }

    /**
     * 发送视频消息
     * 流程：先展示占位消息（带进度），上传 OSS 完成后再发 WS 消息
     */
    async sendVideo(file: File): Promise<void> {
        const chatStore = useChatStore()
        const sessionId = chatStore.currentSessionId

        // 提取视频首帧、尺寸和时长
        const videoMeta = await extractVideoFrame(file);
        const filePath = window.webUtils.getPathForFile(file);
        
        // 1. 构建占位消息并立即上屏
        const { clientId, localMsg } = buildVideoLocalMsg({
            url: '',
            localPath: filePath,
            thumbnailUrl: toLocalPreviewUrlRaw(videoMeta.thumbnailUrl),
            width: videoMeta.width,
            height: videoMeta.height,
            duration: videoMeta.duration,
            uploadProgress: 0,
            size: file.size,
            format: file.type,
        }, sessionId)
        chatStore.addMessage(localMsg)

        try {
            // 2. 上传到 OSS，实时更新进度
            const { promise, abort } = fileService.uploadFile(
                file,
                ApiTypes.file.FileType.FileTypeChatFile,
                (progress) => chatStore.updateMessageProgress(sessionId, clientId, progress)
            )
            this.uploadAbortControllers.set(clientId, abort);

            const ossUrl = await promise;
            this.uploadAbortControllers.delete(clientId);

            // 3. 更新 store 中占位消息的 OSS URL 并持久化
            const storedMsg = chatStore.messages.find(m => m.clientId === clientId) as ILocalVideoMessage | undefined
            if (storedMsg) {
                storedMsg.url = ossUrl
                void messageStorageService.saveMessage(storedMsg).catch(e =>
                    console.error('[WebSocketService] Failed to persist video ossUrl:', e)
                )
            }

            // 4. 用 buildVideoWsPayload 从已有本地消息拼装 WS 载荷并发送
            const finalMsg = buildVideoWsPayload(localMsg, ossUrl, sessionId)
            const result = await this.send(finalMsg, clientId, sessionId)
            if (!result.success || !result.data?.sent) {
                chatStore.updateMessageStatus(
                    sessionId, clientId,
                    ImTypes.MessageStatus.MESSAGE_STATUS_FAILED, Date.now()
                )
            }
        } catch (e) {
            console.error('[WebSocketService] sendVideo failed:', e)
            chatStore.updateMessageStatus(
                sessionId, clientId,
                ImTypes.MessageStatus.MESSAGE_STATUS_FAILED, Date.now()
            )
            chatStore.updateMessageProgress(sessionId, clientId, undefined)
            this.uploadAbortControllers.delete(clientId);
        }
    }

    /**
     * 取消上传
     * @param clientId 消息的 clientId
     */
    cancelUpload(clientId: string): void {
        const abort = this.uploadAbortControllers.get(clientId);
        const chatStore = useChatStore()
        const sessionId = chatStore.currentSessionId
        if (abort) {
            abort();
            this.uploadAbortControllers.delete(clientId);

            chatStore.updateMessageStatus(
                sessionId, clientId,
                ImTypes.MessageStatus.MESSAGE_STATUS_FAILED, Date.now()
            )
            chatStore.updateMessageProgress(sessionId, clientId, undefined)
        }
    }
}

export const websocketService = new WebSocketService()
export default websocketService
