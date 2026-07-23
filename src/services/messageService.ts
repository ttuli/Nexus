/**
 * 消息持久化服务 (Message Database Service)
 * 封装所有与 SQLite（通过 IPC）的消息读写操作
 * 不涉及状态管理，不依赖 Pinia Store
 */
import { IChatMessage } from '@shared/types/chatMessage';
import { IpcChannels } from '@shared/types/ipc';
import { ipcService } from './ipcService';
import { toRaw } from 'vue';

class MessageService {
    /**
     * 保存单条消息到 SQLite (纯数据库写入，无 UI/Store 副作用)
     */
    async saveMessage(message: IChatMessage): Promise<void> {
        const res = await ipcService.invoke(IpcChannels.MSG_SAVE, JSON.parse(JSON.stringify(toRaw(message))));
        if (!res.success) throw new Error(res.error ?? `IPC call failed: ${IpcChannels.MSG_SAVE}`);
    }

    /**
     * 批量保存消息（upsert many）
     */
    async saveMessages(messages: IChatMessage[]): Promise<void> {
        if (messages.length === 0) return;
        const res = await ipcService.invoke(IpcChannels.MSG_SAVE_MANY, messages.map(m => JSON.parse(JSON.stringify(toRaw(m)))));
        if (!res.success) {
            console.error('[MessageService] saveMessages failed:', res.error);
        }
    }

    /**
     * 按 clientId / msgId 更新本地 SQLite 中的消息状态（无需完整消息对象，
     * status 列与 data JSON 由主进程同步更新）。用于撤回等只持有 msgId 的场景。
     * @param sessionKey 会话标识（非空即可，DB 定位实际按 msgId/clientId 全局查找）
     */
    async updateMessageStatus(sessionKey: string, clientId: string, status: number, msgId?: string, seq?: string): Promise<void> {
        const res = await ipcService.invoke(IpcChannels.MSG_UPDATE_STATUS, sessionKey, clientId, status, msgId, seq);
        if (!res.success) {
            console.error('[MessageService] updateMessageStatus failed:', res.error);
        }
    }

    /**
     * 从本地 SQLite 拉取历史消息
     * @param sessionKey  会话 session_key（本地标识，如 private_123_456）
     * @param beforeSeq   排他性上界（Lamport seq 字符串）：只返回 seq < beforeSeq 的消息；
     *                    undefined 表示从最新开始（无上界）
     * @param limit       最多返回条数
     */
    async getLocalHistoryMessages(sessionKey: string, beforeSeq: string | undefined, limit: number): Promise<IChatMessage[]> {
        const res = await ipcService.invoke<IChatMessage[]>(
            IpcChannels.MSG_GET_HISTORY,
            sessionKey,
            beforeSeq,
            limit,
        );
        if (res.success && Array.isArray(res.data)) {
            return res.data;
        }
        return [];
    }

    /**
     * 清除指定会话的全部本地消息记录
     */
    async clearMessagesBySessionId(sessionId: string): Promise<void> {
        const res = await ipcService.invoke(IpcChannels.MSG_CLEAR_SESSION, sessionId);
        if (!res.success) {
            console.error('[MessageService] clearMessagesBySessionId failed:', res.error);
        }
    }

}

export const messageService = new MessageService();
export default messageService;