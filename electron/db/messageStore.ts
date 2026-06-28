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

class MessageStore {
    // ── 私有辅助 ─────────────────────────────────────────────────────────────

    /**
     * 将可能的 conversation_id 转换解析为本地的 conv_key
     */
    private async resolveConvKey(sessionId: string): Promise<string> {
        if (!sessionId) return '';
        const row = await dbBridge.get<{ conv_key: string }>(
            'user',
            `SELECT conv_key FROM conversations WHERE conversation_id = ? OR conv_key = ? LIMIT 1`,
            [sessionId, sessionId]
        );
        return row?.conv_key || sessionId;
    }

    /**
     * 通过 msgId 或 clientId 找到已存在的主键（用于 upsert 去重）
     */
    private async findExistingPk(sessionId: string, msgId: string, clientId: string): Promise<string | null> {
        const resolvedSessionId = await this.resolveConvKey(sessionId);
        if (msgId) {
            const row = await dbBridge.get<Pick<MessageRow, 'pk'>>(
                'user',
                `SELECT pk FROM chat_messages WHERE session_id = ? AND msg_id = ? AND msg_id != '' LIMIT 1`,
                [resolvedSessionId, msgId]
            );
            if (row) return row.pk;
        }
        if (clientId) {
            const row = await dbBridge.get<Pick<MessageRow, 'pk'>>(
                'user',
                `SELECT pk FROM chat_messages WHERE session_id = ? AND client_id = ? AND client_id != '' LIMIT 1`,
                [resolvedSessionId, clientId]
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

        const sessionId = await this.resolveConvKey(message.sessionId);
        const msgId = message.msgId || '';
        const clientId = message.clientId || '';

        const existingPk = await this.findExistingPk(sessionId, msgId, clientId);
        const pk = existingPk ?? buildPk({ ...message, sessionId });

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
                JSON.stringify({ ...message, sessionId }),
                Date.now(),
            ]
        );
    }

    /**
     * 批量保存消息（原子事务，保证原子性）
     */
    async saveMessages(messages: IChatMessage[]): Promise<void> {
        if (!messages.length) return;

        // 解析每一个消息的 sessionId 为 conv_key
        const resolvedList = await Promise.all(messages.map(async m => {
            if (!m?.sessionId) return null;
            const convKey = await this.resolveConvKey(m.sessionId);
            return { message: m, convKey };
        }));
        const validList = resolvedList.filter((item): item is { message: IChatMessage; convKey: string } => item !== null);
        if (!validList.length) return;

        // 提取所有非空的 msgId 和 clientId，使用 Set 去重
        const msgIds = Array.from(new Set(validList.map(m => m.message.msgId).filter(Boolean))) as string[];
        const clientIds = Array.from(new Set(validList.map(m => m.message.clientId).filter(Boolean))) as string[];

        const existingPkMap = new Map<string, string>();
        const chunkSize = 900; // SQLite 一次 IN 查询变量安全上限

        // 批量查询存在的 msgId
        for (let i = 0; i < msgIds.length; i += chunkSize) {
            const chunk = msgIds.slice(i, i + chunkSize);
            const placeholders = chunk.map(() => '?').join(',');
            const rows = await dbBridge.query<{ pk: string, session_id: string, msg_id: string }>(
                'user',
                `SELECT pk, session_id, msg_id FROM chat_messages WHERE msg_id IN (${placeholders})`,
                chunk
            );
            for (const row of rows) {
                existingPkMap.set(`${row.session_id}:msg:${row.msg_id}`, row.pk);
            }
        }

        // 批量查询存在的 clientId
        for (let i = 0; i < clientIds.length; i += chunkSize) {
            const chunk = clientIds.slice(i, i + chunkSize);
            const placeholders = chunk.map(() => '?').join(',');
            const rows = await dbBridge.query<{ pk: string, session_id: string, client_id: string }>(
                'user',
                `SELECT pk, session_id, client_id FROM chat_messages WHERE client_id IN (${placeholders})`,
                chunk
            );
            for (const row of rows) {
                existingPkMap.set(`${row.session_id}:cli:${row.client_id}`, row.pk);
            }
        }

        const ops: Array<{ sql: string; params: unknown[] }> = [];

        for (const item of validList) {
            const { message, convKey } = item;
            const msgId = message.msgId || '';
            const clientId = message.clientId || '';

            // 从 map 中快速匹配 existingPk
            let existingPk: string | null = null;
            if (msgId) {
                existingPk = existingPkMap.get(`${convKey}:msg:${msgId}`) || null;
            }
            if (!existingPk && clientId) {
                existingPk = existingPkMap.get(`${convKey}:cli:${clientId}`) || null;
            }

            const pk = existingPk ?? buildPk({ ...message, sessionId: convKey });

            ops.push({
                sql: `INSERT OR REPLACE INTO chat_messages
                    (pk, session_id, msg_id, client_id, from_user_id, send_time, seq, type, status, is_read, data, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                params: [
                    pk,
                    convKey,
                    msgId,
                    clientId,
                    Number(message.fromUserId) || 0,
                    Number(message.sendTime) || Date.now(),
                    Number(message.seq) || 0,
                    Number(message.type),
                    Number(message.status) || 0,
                    message.isRead ? 1 : 0,
                    JSON.stringify({ ...message, sessionId: convKey }),
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

        // 1. 先通过 clientId 或 msgId 定位已有的行和它当前对应的 session_id
        let row: { pk: string; session_id: string } | null = null;
        if (msgId) {
            row = await dbBridge.get<{ pk: string; session_id: string }>(
                'user',
                `SELECT pk, session_id FROM chat_messages WHERE msg_id = ? AND msg_id != '' LIMIT 1`,
                [msgId]
            );
        }
        if (!row && clientId) {
            row = await dbBridge.get<{ pk: string; session_id: string }>(
                'user',
                `SELECT pk, session_id FROM chat_messages WHERE client_id = ? AND client_id != '' LIMIT 1`,
                [clientId]
            );
        }

        if (!row) return;

        // 彻底移除 SQL 迁移逻辑，仅更新当前消息的状态和 seq
        const whereClause = clientId ? "WHERE client_id = ? AND client_id != ''" : "WHERE msg_id = ? AND msg_id != ''";
        const whereParam = clientId || msgId || '';
        
        if (seq !== undefined && seq > 0) {
            await dbBridge.execute(
                'user',
                `UPDATE chat_messages 
                 SET status = ?, seq = ?, msg_id = COALESCE(NULLIF(msg_id, ''), ?), data = json_set(data, '$.status', ?, '$.seq', ?, '$.msgId', COALESCE(NULLIF(json_extract(data, '$.msgId'), ''), ?)), updated_at = ? 
                 ${whereClause}`,
                [Number(status), Number(seq), msgId || '', Number(status), Number(seq), msgId || '', Date.now(), whereParam]
            );
        } else {
            await dbBridge.execute(
                'user',
                `UPDATE chat_messages 
                 SET status = ?, msg_id = COALESCE(NULLIF(msg_id, ''), ?), data = json_set(data, '$.status', ?, '$.msgId', COALESCE(NULLIF(json_extract(data, '$.msgId'), ''), ?)), updated_at = ? 
                 ${whereClause}`,
                [Number(status), msgId || '', Number(status), msgId || '', Date.now(), whereParam]
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

        const resolvedSessionId = await this.resolveConvKey(sessionId);
        const pk = await this.findExistingPk(resolvedSessionId, msgId || '', clientId);
        if (!pk) return;

        await dbBridge.execute(
            'user',
            `UPDATE chat_messages SET data = json_set(data, '$.localPath', ?), updated_at = ? WHERE pk = ?`,
            [localPath, Date.now(), pk]
        );
    }

    /**
     * 获取会话历史消息（分页，倒序 seq 游标）
     *
     * @param sessionId  会话 ID
     * @param beforeSeq  排他性上界：只返回 seq > 0 且 seq < beforeSeq 的已确认消息；
     *                   传入 Number.MAX_SAFE_INTEGER 表示从最新开始
     * @param pageSize   每页条数
     * @returns          按 seq 升序排列的消息列表（内部已翻转）
     */
    async getLocalHistoryMessages(sessionId: string, beforeSeq: number, pageSize: number): Promise<IChatMessage[]> {
        if (!sessionId || pageSize <= 0) return [];

        const resolvedSessionId = await this.resolveConvKey(sessionId);
        const rows = await dbBridge.query<MessageRow>(
            'user',
            `SELECT * FROM chat_messages
             WHERE session_id = ? AND seq > 0 AND seq < ?
             ORDER BY seq DESC
             LIMIT ?`,
            [resolvedSessionId, beforeSeq, pageSize]
        );
        // DESC 查出最新→最旧，翻转为升序返回
        return rows.reverse().map(rowToMessage);
    }

    /**
     * 清空某会话的所有消息
     */
    async clearMessagesBySessionId(sessionId: string): Promise<void> {
        if (!sessionId) return;
        const resolvedSessionId = await this.resolveConvKey(sessionId);
        await dbBridge.execute('user', `DELETE FROM chat_messages WHERE session_id = ?`, [resolvedSessionId]);
    }
}

export const messageStore = new MessageStore();
