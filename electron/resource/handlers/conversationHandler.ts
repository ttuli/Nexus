import { ipcMain } from 'electron';
import { conversationStore } from '@/electron/db/conversationStore';
import { IpcChannels } from '@/src/types/ipc';
import type { ImTypes } from '@/src/types';

export function setupConversationHandlers(): void {
    /** 获取会话列表 */
    ipcMain.handle(IpcChannels.CONVERSATION_GET_LIST, async () => {
        try {
            const data = await conversationStore.getAll();
            return { success: true, data };
        } catch (err: any) {
            console.error('[conversationHandler] CONVERSATION_GET_LIST error:', err);
            return { success: false, error: String(err?.message ?? err) };
        }
    });

    /** 批量保存会话 */
    ipcMain.handle(IpcChannels.CONVERSATION_GET, async (_event, keyOrId: string) => {
        try {
            const conversation = await conversationStore.get(keyOrId);
            return { success: true, data: conversation };
        } catch (err) {
            console.error('[conversationHandler] CONVERSATION_GET error:', err);
            return { success: false, error: (err as Error).message };
        }
    });

    ipcMain.handle(IpcChannels.CONVERSATION_SAVE_LIST, async (_event, chatList: ImTypes.Conversation[]) => {
        try {
            await conversationStore.saveMany(chatList);
            return { success: true };
        } catch (err: any) {
            console.error('[conversationHandler] CONVERSATION_SAVE_LIST error:', err);
            return { success: false, error: String(err?.message ?? err) };
        }
    });

    /** 删除单个会话 */
    ipcMain.handle(IpcChannels.CONVERSATION_DELETE, async (_event, conversationId: string) => {
        try {
            await conversationStore.delete(conversationId);
            return { success: true };
        } catch (err: any) {
            console.error('[conversationHandler] CONVERSATION_DELETE error:', err);
            return { success: false, error: String(err?.message ?? err) };
        }
    });
}
