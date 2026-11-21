import { ipcMain } from 'electron';
import { messageStore } from '@/electron/db/messageStore';
import { windowManager } from '@/electron/windows/windowManager';
import { WindowKey } from '@shared/config/windowKeys';
import { IpcChannels } from '@shared/types/ipc';
import type { IChatMessage, LocalHistoryQuery } from '@shared/types/chatMessage';
import { MessageStatus } from '@shared/types/proto';

/**
 * 撤回落库后通知历史消息窗口，把这些消息从列表里移除（窗口没开时什么都不发）。
 * 放在落库这一层统一发：自己撤回、收到对方撤回、离线补拉对齐撤回、翻页拉回已撤回的消息，
 * 最后都经 MSG_SAVE / MSG_SAVE_MANY / MSG_UPDATE_STATUS 写库，不必逐条链路去通知
 */
function notifyRecalled(msgIds: string[]): void {
    if (msgIds.length > 0) windowManager.sendMessage(WindowKey.History, IpcChannels.MSG_RECALLED, msgIds);
}

/** 与落库一致按 Number 比较状态：IPC 传来的 status 不保证是数字 */
const isRecalled = (status: unknown) => Number(status) === MessageStatus.MESSAGE_STATUS_RECALLED;

const recalledIdsOf = (messages: IChatMessage[]): string[] =>
    messages.filter(m => isRecalled(m?.status) && m.msgId).map(m => m.msgId);

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
            notifyRecalled(recalledIdsOf([message]));
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
            notifyRecalled(recalledIdsOf(messages));
            return { success: true };
        } catch (err: any) {
            console.error('[messageHandler] MSG_SAVE_MANY error:', err);
            return { success: false, error: String(err?.message ?? err) };
        }
    });

    /** 更新消息状态 */
    ipcMain.handle(
        IpcChannels.MSG_UPDATE_STATUS,
        async (_event, sessionKey: string, clientId: string, status: MessageStatus, msgId?: string, seq?: string) => {
            try {
                await messageStore.updateMessageStatus(sessionKey, clientId, status, msgId, seq);
                if (isRecalled(status) && msgId) notifyRecalled([msgId]);
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
        async (_event, sessionKey: string, clientId: string, msgId: string, localPath: string) => {
            try {
                await messageStore.updateMessageLocalPath(sessionKey, clientId, msgId, localPath);
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
        async (_event, sessionKey: string, beforeSeq: string | undefined, pageSize: number) => {
            try {
                const data = await messageStore.getLocalHistoryMessages(sessionKey, beforeSeq, pageSize);
                return { success: true, data };
            } catch (err: any) {
                console.error('[messageHandler] MSG_GET_HISTORY error:', err);
                return { success: false, error: String(err?.message ?? err) };
            }
        }
    );

    /** 往更新的方向取一页（主窗口跳转定位后往下翻） */
    ipcMain.handle(
        IpcChannels.MSG_GET_NEWER,
        async (_event, sessionKey: string, afterSeq: string, pageSize: number) => {
            try {
                const data = await messageStore.getLocalMessagesAfter(sessionKey, afterSeq, pageSize);
                return { success: true, data };
            } catch (err: any) {
                console.error('[messageHandler] MSG_GET_NEWER error:', err);
                return { success: false, error: String(err?.message ?? err) };
            }
        }
    );

    /** 历史消息窗口检索本地消息（按类型 / 关键词筛选，只读） */
    ipcMain.handle(
        IpcChannels.MSG_SEARCH_HISTORY,
        async (_event, sessionKey: string, query: LocalHistoryQuery) => {
            try {
                const data = await messageStore.searchHistoryMessages(sessionKey, query);
                return { success: true, data };
            } catch (err: any) {
                console.error('[messageHandler] MSG_SEARCH_HISTORY error:', err);
                return { success: false, error: String(err?.message ?? err) };
            }
        }
    );

    /** 删除单条消息（本地删除并记墓碑） */
    ipcMain.handle(
        IpcChannels.MSG_DELETE,
        async (_event, sessionKey: string, msgId: string, clientId: string) => {
            try {
                const data = await messageStore.deleteMessage(sessionKey, msgId, clientId);
                return { success: true, data };
            } catch (err: any) {
                console.error('[messageHandler] MSG_DELETE error:', err);
                return { success: false, error: String(err?.message ?? err) };
            }
        }
    );

    /** 获取会话最新一条消息 */
    ipcMain.handle(IpcChannels.MSG_GET_LATEST, async (_event, sessionKey: string) => {
        try {
            const data = await messageStore.getLatestMessage(sessionKey);
            return { success: true, data };
        } catch (err: any) {
            console.error('[messageHandler] MSG_GET_LATEST error:', err);
            return { success: false, error: String(err?.message ?? err) };
        }
    });

    /** 清空会话消息 */
    ipcMain.handle(IpcChannels.MSG_CLEAR_SESSION, async (_event, sessionKey: string) => {
        try {
            await messageStore.clearMessagesBySessionId(sessionKey);
            return { success: true };
        } catch (err: any) {
            console.error('[messageHandler] MSG_CLEAR_SESSION error:', err);
            return { success: false, error: String(err?.message ?? err) };
        }
    });
}
