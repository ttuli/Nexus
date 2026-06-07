import { IChatMessage } from '@/types/chatMessage';
import { MessageStatus } from '@/types/proto';
import { IpcChannels } from '@/types/ipc';

/**
 * 消息存储服务（渲染进程）
 *
 * 通过 IPC 调用主进程的 messageStore（better-sqlite3），
 * 对外保持与原 IndexedDB 版本相同的异步 API 签名。
 */
class MessageStorageService {
    private invoke<T = void>(channel: string, ...args: unknown[]): Promise<T> {
        return window.ipcRenderer.invoke(channel, ...args).then((res: { success: boolean; data?: T; error?: string }) => {
            if (!res.success) {
                throw new Error(res.error ?? `IPC call failed: ${channel}`);
            }
            return res.data as T;
        });
    }

    /**
     * 保存单条消息（upsert）
     */
    async saveMessage(message: IChatMessage): Promise<void> {
        if (!message?.sessionId) return;
        await this.invoke(IpcChannels.MSG_SAVE, message);
    }

    /**
     * 批量保存消息（事务）
     */
    async saveMessages(messages: IChatMessage[]): Promise<void> {
        if (!messages.length) return;
        await this.invoke(IpcChannels.MSG_SAVE_MANY, messages);
    }

    /**
     * 更新消息状态
     */
    async updateMessageStatus(
        sessionId: string,
        clientId: string,
        status: MessageStatus,
        msgId?: string
    ): Promise<void> {
        if (!sessionId || (!clientId && !msgId)) return;
        await this.invoke(IpcChannels.MSG_UPDATE_STATUS, sessionId, clientId, status, msgId);
    }

    /**
     * 获取会话历史消息（分页，倒序游标）
     *
     * @param sessionId  会话 ID
     * @param upper      send_time 上界（含）
     * @param pageSize   每页条数
     */
    async getLocalHistoryMessages(
        sessionId: string,
        upper: number,
        pageSize: number
    ): Promise<IChatMessage[]> {
        if (!sessionId || pageSize <= 0) return [];
        return this.invoke<IChatMessage[]>(IpcChannels.MSG_GET_HISTORY, sessionId, upper, pageSize);
    }

    /**
     * 清空某会话的所有消息
     */
    async clearMessagesBySessionId(sessionId: string): Promise<void> {
        if (!sessionId) return;
        await this.invoke(IpcChannels.MSG_CLEAR_SESSION, sessionId);
    }

    /**
     * 更新消息本地文件路径（媒体下载/发送缓存）
     */
    async updateMessageLocalPath(
        sessionId: string,
        clientId: string,
        msgId: string,
        localPath: string
    ): Promise<void> {
        if (!sessionId || (!clientId && !msgId)) return;
        await this.invoke(IpcChannels.MSG_UPDATE_LOCAL_PATH, sessionId, clientId, msgId, localPath);
    }
}

export const messageStorageService = new MessageStorageService();
