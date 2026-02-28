import { ipcService } from './ipcService'
import { IpcChannels, IpcResponse, ImTypes, ApiTypes } from '../types'
import { ILocalImageMessage, ILocalFileMessage } from '@/types/chatMessage'
import { buildTextWsMessage, buildImageLocalMsg, buildImageWsPayload, buildFileWsMessage, toLocalPreviewUrl } from '@/utils/chat'
import { useChatStore } from '@/store/chat'
import { fileService } from './fileService'
import { chatService } from './chatService'

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
    async send(message: ImTypes.WSMessage, clientId = ''): Promise<IpcResponse & { sent?: boolean, error?: string }> {
        return ipcService.invoke(IpcChannels.WS_SEND, message, clientId)
    }

    /**
     * 发送文本消息
     */
    async sendText(content: string): Promise<void> {
        const chatStore = useChatStore()
        const sessionId = chatStore.currentSessionId

        const { msg, clientId, localMsg } = buildTextWsMessage(content, sessionId)
        chatStore.addMessage(localMsg)

        const result = await this.send(msg, clientId)
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
        bitmap.close()

        // 2. 初始化占位消息（仅需本地消息，不需要 WS payload）
        const { clientId, localMsg } = buildImageLocalMsg({
            url: '',
            localPath: toLocalPreviewUrl(file.path),
            uploadProgress: 0,
            width: imgWidth,
            height: imgHeight,
            size: file.size,
            format: file.type,
        }, sessionId)
        chatStore.addMessage(localMsg)

        try {
            // 3. 上传到 OSS，实时更新进度
            const { promise, abort } = fileService.uploadFile(
                file,
                ApiTypes.file.FileType.FileTypeChatImage,
                (progress) => chatStore.updateMessageProgress(clientId, progress)
            )
            this.uploadAbortControllers.set(clientId, abort);

            const ossUrl = await promise;
            this.uploadAbortControllers.delete(clientId);

            // 4. 更新 store 中占位消息的 OSS URL，并持久化到 DB
            const storedMsg = chatStore.messages.find(m => m.clientId === clientId) as ILocalImageMessage | undefined
            if (storedMsg) {
                storedMsg.url = ossUrl
                void chatService.saveMessage(storedMsg).catch(e =>
                    console.error('[WebSocketService] Failed to persist image ossUrl:', e)
                )
            }

            // 5. 用 buildImageWsPayload 直接从已有本地消息拼装 WS 载荷，不再重复所有内容
            const finalMsg = buildImageWsPayload(localMsg, ossUrl, sessionId)
            const result = await this.send(finalMsg, clientId)
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
            chatStore.updateMessageProgress(clientId, undefined)
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

        // 1. 通过 buildWsMessage 统一构建占位消息
        const { clientId, localMsg } = buildFileWsMessage({
            url: '',
            localPath: file.path,
            uploadProgress: 0,
            fileName: file.name,
            size: file.size,
        }, sessionId)
        chatStore.addMessage(localMsg)

        try {
            // 2. 上传到 OSS，实时更新进度
            const { promise, abort } = fileService.uploadFile(
                file,
                ApiTypes.file.FileType.FileTypeChatFile,
                (progress) => chatStore.updateMessageProgress(clientId, progress)
            )
            this.uploadAbortControllers.set(clientId, abort);

            const ossUrl = await promise;
            this.uploadAbortControllers.delete(clientId);

            const msgIndex = chatStore.messages.findIndex(m => m.clientId === clientId)
            if (msgIndex !== -1) {
                const storedMsg = chatStore.messages[msgIndex] as ILocalFileMessage;
                storedMsg.url = ossUrl
                // 持久化 URL 到 DB
                void chatService.saveMessage(storedMsg).catch(e =>
                    console.error('[WebSocketService] Failed to persist file ossUrl:', e)
                )
            }

            // 4. 构建最终 WS payload 并发送（复用同一个 clientId，保证 ACK 能匹配）
            // const { msg: finalMsg } = buildFileWsMessage({ url: ossUrl, fileName: file.name, size: file.size }, sessionId, clientId)
            // const result = await this.send(finalMsg, clientId)
            // if (!result.success || !result.data?.sent) {
            //     chatStore.updateMessageStatus(
            //         sessionId, clientId,
            //         ImTypes.MessageStatus.MESSAGE_STATUS_FAILED, Date.now()
            //     )
            // }
        } catch (e) {
            console.error('[WebSocketService] sendFile failed:', e)
            chatStore.updateMessageStatus(
                sessionId, clientId,
                ImTypes.MessageStatus.MESSAGE_STATUS_FAILED, Date.now()
            )
            chatStore.updateMessageProgress(clientId, undefined)
            this.uploadAbortControllers.delete(clientId);
        }
    }

    /**
     * 取消上传
     * @param clientId 消息的 clientId
     */
    cancelUpload(clientId: string): void {
        const abort = this.uploadAbortControllers.get(clientId);
        if (abort) {
            abort();
            this.uploadAbortControllers.delete(clientId);

            const chatStore = useChatStore()
            chatStore.updateMessageStatus(
                chatStore.currentSessionId, clientId,
                ImTypes.MessageStatus.MESSAGE_STATUS_FAILED, Date.now()
            )
            chatStore.updateMessageProgress(clientId, undefined)
        }
    }
}

export const websocketService = new WebSocketService()
export default websocketService
