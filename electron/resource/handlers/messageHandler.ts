import { ipcMain } from 'electron';
import { messageStore } from '../../db/messageStore';
import { IpcChannels } from '../../../src/types/ipc';
import type { IChatMessage } from '../../../src/types/chatMessage';
import { MessageStatus } from '../../../src/types/proto';

/**
 * 注册消息存储相关的 IPC Handler
 *
 * 所有 handler 均为同步操作（better-sqlite3），用 try/catch 包裹后
 * 返回统一格式 { success, data?, error? }，避免主进程崩溃。
 */
export function setupMessageHandlers(): void {

    /** 保存单条消息 */
    ipcMain.handle(IpcChannels.MSG_SAVE, (_event, message: IChatMessage) => {
        try {
            messageStore.saveMessage(message);
            return { success: true };
        } catch (err: any) {
            console.error('[messageHandler] MSG_SAVE error:', err);
            return { success: false, error: String(err?.message ?? err) };
        }
    });

    /** 批量保存消息（事务） */
    ipcMain.handle(IpcChannels.MSG_SAVE_MANY, (_event, messages: IChatMessage[]) => {
        try {
            messageStore.saveMessages(messages);
            return { success: true };
        } catch (err: any) {
            console.error('[messageHandler] MSG_SAVE_MANY error:', err);
            return { success: false, error: String(err?.message ?? err) };
        }
    });

    /** 更新消息状态 */
    ipcMain.handle(
        IpcChannels.MSG_UPDATE_STATUS,
        (_event, sessionId: string, clientId: string, status: MessageStatus, msgId?: string) => {
            try {
                messageStore.updateMessageStatus(sessionId, clientId, status, msgId);
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
        (_event, sessionId: string, clientId: string, msgId: string, localPath: string) => {
            try {
                messageStore.updateMessageLocalPath(sessionId, clientId, msgId, localPath);
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
        (_event, sessionId: string, upper: number, pageSize: number) => {
            try {
                const data = messageStore.getLocalHistoryMessages(sessionId, upper, pageSize);
                return { success: true, data };
            } catch (err: any) {
                console.error('[messageHandler] MSG_GET_HISTORY error:', err);
                return { success: false, error: String(err?.message ?? err) };
            }
        }
    );

    /** 清空会话消息 */
    ipcMain.handle(IpcChannels.MSG_CLEAR_SESSION, (_event, sessionId: string) => {
        try {
            messageStore.clearMessagesBySessionId(sessionId);
            return { success: true };
        } catch (err: any) {
            console.error('[messageHandler] MSG_CLEAR_SESSION error:', err);
            return { success: false, error: String(err?.message ?? err) };
        }
    });
}
