import { dbBridge } from './dbWorkerBridge';
import type { ImTypes } from '@/src/types';

class SessionStore {
    /**
     * 获取所有会话列表
     */
    async getAll(): Promise<(ImTypes.Session & { is_in_list?: number })[]> {
        const rows = await dbBridge.query<any>(
            'user',
            'SELECT session_id, type, session_key, max_seq, last_sender, last_content, last_message_time, unread_count, is_top, is_disturb, create_time, update_time, is_in_list FROM conversations'
        );
        return rows.map(r => ({
            session_id: r.session_id,
            type: r.type,
            session_key: r.session_key || '',
            max_seq: r.max_seq,
            last_sender: r.last_sender,
            last_content: r.last_content,
            last_message_time: r.last_message_time,
            unread_count: r.unread_count,
            is_top: r.is_top,
            is_disturb: r.is_disturb,
            create_time: r.create_time,
            update_time: r.update_time,
            is_in_list: r.is_in_list ?? 0,
        }));
    }

    /**
     * 获取单个会话
     */
    async get(keyOrId: string): Promise<(ImTypes.Session & { is_in_list?: number }) | null> {
        const row = await dbBridge.get<any>(
            'user',
            'SELECT session_id, type, session_key, max_seq, last_sender, last_content, last_message_time, unread_count, is_top, is_disturb, create_time, update_time, is_in_list FROM conversations WHERE conv_key = ? OR conversation_id = ?',
            [keyOrId, keyOrId]
        );
        if (!row) return null;
        return {
            session_id: row.session_id,
            type: row.type,
            session_key: row.session_key || '',
            max_seq: row.max_seq,
            last_sender: row.last_sender,
            last_content: row.last_content,
            last_message_time: row.last_message_time,
            unread_count: row.unread_count,
            is_top: row.is_top,
            is_disturb: row.is_disturb,
            create_time: row.create_time,
            update_time: row.update_time,
            is_in_list: row.is_in_list ?? 0,
        };
    }

    async save(session: ImTypes.Session & { is_in_list?: number }): Promise<void> {
        await dbBridge.execute(
            'user',
            `INSERT INTO conversations (
                session_id, type, session_key, max_seq, last_sender, last_content, 
                last_message_time, unread_count, is_top, is_disturb, create_time, update_time, is_in_list
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(conv_key) DO UPDATE SET
                conversation_id = CASE WHEN EXCLUDED.conversation_id != '' THEN EXCLUDED.conversation_id ELSE conversations.conversation_id END,
                type = EXCLUDED.type,
                max_seq = CASE WHEN EXCLUDED.max_seq > conversations.max_seq THEN EXCLUDED.max_seq ELSE conversations.max_seq END,
                last_sender = CASE WHEN EXCLUDED.last_message_time >= conversations.last_message_time THEN EXCLUDED.last_sender ELSE conversations.last_sender END,
                last_content = CASE WHEN EXCLUDED.last_message_time >= conversations.last_message_time THEN EXCLUDED.last_content ELSE conversations.last_content END,
                last_message_time = CASE WHEN EXCLUDED.last_message_time >= conversations.last_message_time THEN EXCLUDED.last_message_time ELSE conversations.last_message_time END,
                unread_count = EXCLUDED.unread_count,
                is_top = EXCLUDED.is_top,
                is_disturb = EXCLUDED.is_disturb,
                update_time = EXCLUDED.update_time,
                is_in_list = EXCLUDED.is_in_list`,
            [
                session.session_id,
                session.type,
                session.session_key,
                session.max_seq,
                session.last_sender,
                session.last_content,
                session.last_message_time,
                session.unread_count,
                session.is_top,
                session.is_disturb,
                session.create_time,
                session.update_time,
                session.is_in_list ?? 0
            ]
        );
    }

    /**
     * 批量保存会话
     */
    async saveMany(sessions: (ImTypes.Session & { is_in_list?: number })[]): Promise<void> {
        if (!sessions.length) return;
        const ops = sessions.map(s => ({
            sql: `INSERT INTO conversations (
                session_id, type, session_key, max_seq, last_sender, last_content, 
                last_message_time, unread_count, is_top, is_disturb, create_time, update_time, is_in_list
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(conv_key) DO UPDATE SET
                conversation_id = CASE WHEN EXCLUDED.conversation_id != '' THEN EXCLUDED.conversation_id ELSE conversations.conversation_id END,
                type = EXCLUDED.type,
                max_seq = CASE WHEN EXCLUDED.max_seq > conversations.max_seq THEN EXCLUDED.max_seq ELSE conversations.max_seq END,
                last_sender = CASE WHEN EXCLUDED.last_message_time >= conversations.last_message_time THEN EXCLUDED.last_sender ELSE conversations.last_sender END,
                last_content = CASE WHEN EXCLUDED.last_message_time >= conversations.last_message_time THEN EXCLUDED.last_content ELSE conversations.last_content END,
                last_message_time = CASE WHEN EXCLUDED.last_message_time >= conversations.last_message_time THEN EXCLUDED.last_message_time ELSE conversations.last_message_time END,
                unread_count = EXCLUDED.unread_count,
                is_top = EXCLUDED.is_top,
                is_disturb = EXCLUDED.is_disturb,
                update_time = EXCLUDED.update_time,
                is_in_list = EXCLUDED.is_in_list`,
            params: [
                s.session_id,
                s.type,
                s.session_key,
                s.max_seq,
                s.last_sender,
                s.last_content,
                s.last_message_time,
                s.unread_count,
                s.is_top,
                s.is_disturb,
                s.create_time,
                s.update_time,
                s.is_in_list ?? 0
            ] as unknown[]
        }));
        await dbBridge.transaction('user', ops);
    }

    /**
     * 删除单个会话
     */
    async delete(keyOrId: string): Promise<void> {
        await dbBridge.execute(
            'user',
            'DELETE FROM conversations WHERE session_key = ? OR session_id = ?',
            [keyOrId, keyOrId]
        );
    }

    /**
     * 清空会话表
     */
    async clear(): Promise<void> {
        await dbBridge.execute('user', 'DELETE FROM conversations', []);
    }
}

export const sessionStore = new SessionStore();
