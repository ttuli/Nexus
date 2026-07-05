/**
 * Session 持久化服务
 * 封装所有与 SQLite（通过 IPC）的 session 读写操作
 * store 只负责响应式状态管理，持久化逻辑统一由此服务负责
 */

import { ipcService } from './ipcService';
import { IpcChannels } from '@/src/types/ipc';
import type { ImTypes } from '@/src/types';

class SessionService {
    /**
     * 从 SQLite 加载全部会话列表
     */
    async loadAll(): Promise<ImTypes.Session[]> {
        try {
            const res = await ipcService.invoke<ImTypes.Session[]>(IpcChannels.SESSION_GET_LIST);
            if (res.success && Array.isArray(res.data)) {
                return res.data;
            }
            console.error('[SessionService] loadAll failed:', res.error);
            return [];
        } catch (e) {
            console.error('[SessionService] loadAll error:', e);
            return [];
        }
    }

    /**
     * 从 SQLite 加载单个会话（按 session_key 或 session_id 查询）
     */
    async loadOne(keyOrId: string): Promise<ImTypes.Session | null> {
        try {
            const res = await ipcService.invoke<ImTypes.Session>(IpcChannels.SESSION_GET, keyOrId);
            if (res.success && res.data) {
                return res.data;
            }
            return null;
        } catch (e) {
            console.error('[SessionService] loadOne error:', e);
            return null;
        }
    }

    /**
     * 批量保存/更新会话到 SQLite（Upsert）
     */
    async saveMany(sessions: ImTypes.Session[]): Promise<boolean> {
        if (!sessions.length) return true;
        try {
            const res = await ipcService.invoke(IpcChannels.SESSION_SAVE_LIST, sessions);
            if (!res.success) {
                console.error('[SessionService] saveMany failed:', res.error);
            }
            return res.success;
        } catch (e) {
            console.error('[SessionService] saveMany error:', e);
            return false;
        }
    }

    /**
     * 从 SQLite 删除单个会话
     */
    async deleteOne(sessionKey: string): Promise<boolean> {
        try {
            const res = await ipcService.invoke(IpcChannels.SESSION_DELETE, sessionKey);
            if (!res.success) {
                console.error('[SessionService] deleteOne failed:', res.error);
            }
            return res.success;
        } catch (e) {
            console.error('[SessionService] deleteOne error:', e);
            return false;
        }
    }
}

export const sessionService = new SessionService();
export default sessionService;
