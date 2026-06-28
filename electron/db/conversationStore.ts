import { dbBridge } from './dbWorkerBridge';
import type { ImTypes } from '@/src/types';

class ConversationStore {
    /**
     * 获取所有会话列表
     */
    async getAll(): Promise<(ImTypes.Conversation & { is_in_list?: number })[]> {
        const rows = await dbBridge.query<any>(
            'user',
            'SELECT conversation_id, type, conv_key, max_seq, last_sender, last_content, last_message_time, unread_count, is_top, is_disturb, create_time, update_time, is_in_list FROM conversations'
        );
        return rows.map(r => ({
            conversation_id: r.conversation_id,
            type: r.type,
            conv_key: r.conv_key || '',
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
    async get(keyOrId: string): Promise<(ImTypes.Conversation & { is_in_list?: number }) | null> {
        const row = await dbBridge.get<any>(
            'user',
            'SELECT conversation_id, type, conv_key, max_seq, last_sender, last_content, last_message_time, unread_count, is_top, is_disturb, create_time, update_time, is_in_list FROM conversations WHERE conv_key = ? OR conversation_id = ?',
            [keyOrId, keyOrId]
        );
        if (!row) return null;
        return {
            conversation_id: row.conversation_id,
            type: row.type,
            conv_key: row.conv_key || '',
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

    async save(conversation: ImTypes.Conversation & { is_in_list?: number }): Promise<void> {
        await dbBridge.execute(
            'user',
            `INSERT INTO conversations (
                conversation_id, type, conv_key, max_seq, last_sender, last_content, 
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
                conversation.conversation_id,
                conversation.type,
                conversation.conv_key,
                conversation.max_seq,
                conversation.last_sender,
                conversation.last_content,
                conversation.last_message_time,
                conversation.unread_count,
                conversation.is_top,
                conversation.is_disturb,
                conversation.create_time,
                conversation.update_time,
                conversation.is_in_list ?? 0
            ]
        );
    }

    /**
     * 批量保存会话
     */
    async saveMany(conversations: (ImTypes.Conversation & { is_in_list?: number })[]): Promise<void> {
        if (!conversations.length) return;
        const ops = conversations.map(c => ({
            sql: `INSERT INTO conversations (
                conversation_id, type, conv_key, max_seq, last_sender, last_content, 
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
                c.conversation_id,
                c.type,
                c.conv_key,
                c.max_seq,
                c.last_sender,
                c.last_content,
                c.last_message_time,
                c.unread_count,
                c.is_top,
                c.is_disturb,
                c.create_time,
                c.update_time,
                c.is_in_list ?? 0
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
            'DELETE FROM conversations WHERE conv_key = ? OR conversation_id = ?',
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

export const conversationStore = new ConversationStore();
