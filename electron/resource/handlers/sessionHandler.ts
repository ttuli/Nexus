import { ipcMain } from 'electron';
import { sessionStore } from '@/electron/db/sessionStore';
import { IpcChannels } from '@/src/types/ipc';
import type { ImTypes } from '@/src/types';

export function setupSessionHandlers(): void {
    /** 获取会话列表 */
    ipcMain.handle(IpcChannels.SESSION_GET_LIST, async () => {
        try {
            const data = await sessionStore.getAll();
            return { success: true, data };
        } catch (err: any) {
            console.error('[sessionHandler] SESSION_GET_LIST error:', err);
            return { success: false, error: String(err?.message ?? err) };
        }
    });

    /** 获取单个会话 */
    ipcMain.handle(IpcChannels.SESSION_GET, async (_event, sessionkey: string) => {
        try {
            const session = await sessionStore.get(sessionkey);
            return { success: true, data: session };
        } catch (err) {
            console.error('[sessionHandler] CONVERSATION_GET error:', err);
            return { success: false, error: (err as Error).message };
        }
    });

    /** 批量保存/更新会话 (Upsert) */
    ipcMain.handle(IpcChannels.SESSION_SAVE_LIST, async (_event, sessionList: ImTypes.Session[]) => {
        try {
            await sessionStore.saveMany(sessionList);
            return { success: true };
        } catch (err: any) {
            console.error('[sessionHandler] SESSION_SAVE_LIST error:', err);
            return { success: false, error: String(err?.message ?? err) };
        }
    });

    /** 删除单个会话 */
    ipcMain.handle(IpcChannels.SESSION_DELETE, async (_event, sessionId: string) => {
        try {
            await sessionStore.delete(sessionId);
            return { success: true };
        } catch (err: any) {
            console.error('[sessionHandler] SESSION_DELETE error:', err);
            return { success: false, error: String(err?.message ?? err) };
        }
    });
}
