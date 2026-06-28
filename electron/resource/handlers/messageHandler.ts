import { ipcMain } from 'electron';
import { messageStore } from '@/electron/db/messageStore';
import { IpcChannels } from '@/src/types/ipc';
import type { IChatMessage } from '@/src/types/chatMessage';
import { MessageStatus } from '@/src/types/proto';

/**
 * 注册消息存储相关的 IPC Handler
 *
 * 所有 handler 均为 async（messageStore 方法已迁移到 Worker Thread），
 * 用 try/catch 包裹后返回统一格式 { success, data?, error? }。
 */
export function setupMessageHandlers(): void {

    /** 保存单条消息 */
    ipcMain.handle(IpcChannels.MSG_SAVE, async (_event, message: IChatMessage) => {
        try {
            await messageStore.saveMessage(message);
            return { success: true };
        } catch (err: any) {
            console.error('[messageHandler] MSG_SAVE error:', err);
            return { success: false, error: String(err?.message ?? err) };
        }
    });

    /** 批量保存消息（事务） */
    ipcMain.handle(IpcChannels.MSG_SAVE_MANY, async (_event, messages: IChatMessage[]) => {
        try {
            await messageStore.saveMessages(messages);
            return { success: true };
        } catch (err: any) {
            console.error('[messageHandler] MSG_SAVE_MANY error:', err);
            return { success: false, error: String(err?.message ?? err) };
        }
    });

    /** 更新消息状态 */
    ipcMain.handle(
        IpcChannels.MSG_UPDATE_STATUS,
        async (_event, sessionId: string, clientId: string, status: MessageStatus, msgId?: string, seq?: number) => {
            try {
                await messageStore.updateMessageStatus(sessionId, clientId, status, msgId, seq);
                return { success: true };
            } catch (err: any) {
                console.error('[messageHandler] MSG_UPDATE_STATUS error:', err);
                return { success: false, error: String(err?.message ?? err) };
            }
        }
    );

    /** 更新消息本地文件路径 */
    ipcMain.handle(
        IpcChannels.MSG_UPDATE_LOCAL_PATH,
        async (_event, sessionId: string, clientId: string, msgId: string, localPath: string) => {
            try {
                await messageStore.updateMessageLocalPath(sessionId, clientId, msgId, localPath);
                return { success: true };
            } catch (err: any) {
                console.error('[messageHandler] MSG_UPDATE_LOCAL_PATH error:', err);
                return { success: false, error: String(err?.message ?? err) };
            }
        }
    );

    /** 获取会话历史消息 */
    ipcMain.handle(
        IpcChannels.MSG_GET_HISTORY,
        async (_event, sessionId: string, beforeSeq: number, pageSize: number) => {
            try {
                const data = await messageStore.getLocalHistoryMessages(sessionId, beforeSeq, pageSize);
                return { success: true, data };
            } catch (err: any) {
                console.error('[messageHandler] MSG_GET_HISTORY error:', err);
                return { success: false, error: String(err?.message ?? err) };
            }
        }
    );

    /** 清空会话消息 */
    ipcMain.handle(IpcChannels.MSG_CLEAR_SESSION, async (_event, sessionId: string) => {
        try {
            await messageStore.clearMessagesBySessionId(sessionId);
            return { success: true };
        } catch (err: any) {
            console.error('[messageHandler] MSG_CLEAR_SESSION error:', err);
            return { success: false, error: String(err?.message ?? err) };
        }
    });
}
