import { dbBridge } from './dbWorkerBridge';
import type { IChatMessage } from '@/src/types/chatMessage';
import { MessageStatus } from '@/src/types/proto';

// ── 表行类型 ──────────────────────────────────────────────────────────────────

interface MessageRow {
    pk: string;
    session_id: string;
    msg_id: string;
    client_id: string;
    from_user_id: number;
    send_time: number;
    seq: number;
    type: number;
    status: number;
    is_read: number;
    data: string;
    updated_at: number;
}

// ── 辅助函数 ──────────────────────────────────────────────────────────────────

function buildPk(message: IChatMessage): string {
    if (message.msgId) return `msg:${message.sessionId}:${message.msgId}`;
    if (message.clientId) return `cid:${message.sessionId}:${message.clientId}`;
    return `tmp:${message.sessionId}:${Number(message.sendTime) || Date.now()}:${message.seq}:${Math.random().toString(36).slice(2, 10)}`;
}

function rowToMessage(row: MessageRow): IChatMessage {
    return JSON.parse(row.data) as IChatMessage;
}

/**
 * chat_messages 表操作
 *
 * 设计：
 *   - data 列存全量 JSON（IChatMessage），读取时直接 JSON.parse 还原
 *   - 其余列只提炼查询/索引必需的基础字段，写入时同步更新
 *   - 所有方法均为 async，通过 dbBridge 在 Worker Thread 执行
 */
class MessageStore {
    // ── 私有辅助 ─────────────────────────────────────────────────────────────

    /**
     * 通过 msgId 或 clientId 找到已存在的主键（用于 upsert 去重）
     */
    private async findExistingPk(sessionId: string, msgId: string, clientId: string): Promise<string | null> {
        if (msgId) {
            const row = await dbBridge.get<Pick<MessageRow, 'pk'>>(
                'user',
                `SELECT pk FROM chat_messages WHERE session_id = ? AND msg_id = ? AND msg_id != '' LIMIT 1`,
                [sessionId, msgId]
            );
            if (row) return row.pk;
        }
        if (clientId) {
            const row = await dbBridge.get<Pick<MessageRow, 'pk'>>(
                'user',
                `SELECT pk FROM chat_messages WHERE session_id = ? AND client_id = ? AND client_id != '' LIMIT 1`,
                [sessionId, clientId]
            );
            if (row) return row.pk;
        }
        return null;
    }

    // ── 公开 API ──────────────────────────────────────────────────────────────

    /**
     * 保存单条消息（upsert）
     * 优先通过 msgId / clientId 查找已有记录复用同一 pk，避免重复写入
     */
    async saveMessage(message: IChatMessage): Promise<void> {
        if (!message?.sessionId) return;

        const sessionId = message.sessionId;
        const msgId = message.msgId || '';
        const clientId = message.clientId || '';

        const existingPk = await this.findExistingPk(sessionId, msgId, clientId);
        const pk = existingPk ?? buildPk(message);

        await dbBridge.execute(
            'user',
            `INSERT OR REPLACE INTO chat_messages
                (pk, session_id, msg_id, client_id, from_user_id, send_time, seq, type, status, is_read, data, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                pk,
                sessionId,
                msgId,
                clientId,
                Number(message.fromUserId) || 0,
                Number(message.sendTime) || Date.now(),
                Number(message.seq) || 0,
                Number(message.type),
                Number(message.status) || 0,
                message.isRead ? 1 : 0,
                JSON.stringify(message),
                Date.now(),
            ]
        );
    }

    /**
     * 批量保存消息（原子事务，保证原子性）
     */
    async saveMessages(messages: IChatMessage[]): Promise<void> {
        if (!messages.length) return;

        // 先并行查找所有已存在的 pk（避免重复写入）
        const ops: Array<{ sql: string; params: unknown[] }> = [];

        for (const message of messages) {
            if (!message?.sessionId) continue;
            const sessionId = message.sessionId;
            const msgId = message.msgId || '';
            const clientId = message.clientId || '';

            const existingPk = await this.findExistingPk(sessionId, msgId, clientId);
            const pk = existingPk ?? buildPk(message);

            ops.push({
                sql: `INSERT OR REPLACE INTO chat_messages
                    (pk, session_id, msg_id, client_id, from_user_id, send_time, seq, type, status, is_read, data, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                params: [
                    pk,
                    sessionId,
                    msgId,
                    clientId,
                    Number(message.fromUserId) || 0,
                    Number(message.sendTime) || Date.now(),
                    Number(message.seq) || 0,
                    Number(message.type),
                    Number(message.status) || 0,
                    message.isRead ? 1 : 0,
                    JSON.stringify(message),
                    Date.now(),
                ],
            });
        }

        if (ops.length > 0) {
            await dbBridge.transaction('user', ops);
        }
    }

    /**
     * 更新消息状态（优先用 clientId 定位，其次 msgId）
     */
    async updateMessageStatus(
        sessionId: string,
        clientId: string,
        status: MessageStatus,
        msgId?: string,
        seq?: number
    ): Promise<void> {
        if (!sessionId || (!clientId && !msgId)) return;

        const pk = await this.findExistingPk(sessionId, msgId || '', clientId);
        if (!pk) return;

        if (seq !== undefined && seq > 0) {
            await dbBridge.execute(
                'user',
                `UPDATE chat_messages SET status = ?, seq = ?, data = json_set(data, '$.status', ?, '$.seq', ?), updated_at = ? WHERE pk = ?`,
                [Number(status), Number(seq), Number(status), Number(seq), Date.now(), pk]
            );
        } else {
            await dbBridge.execute(
                'user',
                `UPDATE chat_messages SET status = ?, data = json_set(data, '$.status', ?), updated_at = ? WHERE pk = ?`,
                [Number(status), Number(status), Date.now(), pk]
            );
        }
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

        const pk = await this.findExistingPk(sessionId, msgId || '', clientId);
        if (!pk) return;

        await dbBridge.execute(
            'user',
            `UPDATE chat_messages SET data = json_set(data, '$.localPath', ?), updated_at = ? WHERE pk = ?`,
            [localPath, Date.now(), pk]
        );
    }

    /**
     * 获取会话历史消息（分页，倒序游标）
     *
     * @param sessionId  会话 ID
     * @param upper      send_time 上界（含），通常传入当前最老消息的 sendTime 或 Date.now()
     * @param pageSize   每页条数
     * @returns          按 sendTime 升序排列的消息列表（已在内部翻转）
     */
    async getLocalHistoryMessages(sessionId: string, upper: number, pageSize: number): Promise<IChatMessage[]> {
        if (!sessionId || pageSize <= 0) return [];

        const rows = await dbBridge.query<MessageRow>(
            'user',
            `SELECT * FROM chat_messages
             WHERE session_id = ? AND send_time <= ?
             ORDER BY send_time DESC
             LIMIT ?`,
            [sessionId, upper, pageSize]
        );
        // DESC 查出来是最新→最旧，翻转为正序返回
        return rows.reverse().map(rowToMessage);
    }

    /**
     * 清空某会话的所有消息
     */
    async clearMessagesBySessionId(sessionId: string): Promise<void> {
        if (!sessionId) return;
        await dbBridge.execute('user', `DELETE FROM chat_messages WHERE session_id = ?`, [sessionId]);
    }
}

export const messageStore = new MessageStore();
