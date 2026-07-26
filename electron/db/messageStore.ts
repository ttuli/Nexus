import { dbBridge } from './dbWorkerBridge';
import type { IChatMessage } from '@shared/types/chatMessage';
import { MessageStatus } from '@shared/types/proto';
import { toSeq, seqToBigInt, seqPositive } from '@shared/utils/seq';

// ── 表行类型 ──────────────────────────────────────────────────────────────────

interface MessageRow {
    pk: string;
    session_id: string;
    session_key: string;
    msg_id: string;
    client_id: string;
    from_user_id: number;
    send_time: number;
    // seq 列以 int64 存储（写入时绑定 BigInt）；直接读取会丢精度，
    // 仅可用于 = 0 之类的判零检查，精确值一律从 data JSON（string）取
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
    const msg = JSON.parse(row.data) as IChatMessage;
    // 兼容旧数据：历史行 data 内 seq 为 number，统一规整为 string
    msg.seq = toSeq(msg.seq);
    return msg;
}

class MessageStore {
    // ── 私有辅助 ─────────────────────────────────────────────────────────────

    /**
     * 通过 msgId 或 clientId 找到已存在的主键（用于 upsert 去重）
     * 注意：第一个参数是本地 session_key（不是服务端 session_id）
     */
    private async findExistingPk(sessionKey: string, msgId: string, clientId: string): Promise<string | null> {
        if (msgId) {
            const row = await dbBridge.get<Pick<MessageRow, 'pk'>>(
                'user',
                `SELECT pk FROM chat_messages WHERE session_key = ? AND msg_id = ? AND msg_id != '' LIMIT 1`,
                [sessionKey, msgId]
            );
            if (row) return row.pk;
        }
        if (clientId) {
            const row = await dbBridge.get<Pick<MessageRow, 'pk'>>(
                'user',
                `SELECT pk FROM chat_messages WHERE session_key = ? AND client_id = ? AND client_id != '' LIMIT 1`,
                [sessionKey, clientId]
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
        // 使用本地明确的 sessionKey
        const sessionKey = message?.sessionKey;
        if (!sessionKey) return;
        // session_id 优先用消息里的值，若无则与 session_key 相同
        const sessionId = message.sessionId || '';
        const msgId = message.msgId || '';
        const clientId = message.clientId || '';

        const existingPk = await this.findExistingPk(sessionKey, msgId, clientId);
        const pk = existingPk ?? buildPk({ ...message, sessionId: sessionKey });

        await dbBridge.execute(
            'user',
            `INSERT OR REPLACE INTO chat_messages
                (pk, session_id, session_key, msg_id, client_id, from_user_id, send_time, seq, type, status, is_read, data, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                pk,
                sessionId,
                sessionKey,
                msgId,
                clientId,
                Number(message.fromUserId) || 0,
                Number(message.sendTime) || Date.now(),
                seqToBigInt(message.seq),
                Number(message.type),
                Number(message.status) || 0,
                message.isRead ? 1 : 0,
                JSON.stringify({ ...message, sessionId, sessionKey, seq: toSeq(message.seq) }),
                Date.now(),
            ]
        );
    }

    /**
     * 批量保存消息（原子事务，保证原子性）
     */
    async saveMessages(messages: IChatMessage[]): Promise<void> {
        if (!messages.length) return;

        // 直接使用消息自带的 sessionKey
        const resolvedList = messages.map(m => {
            const convKey = m?.sessionKey;
            if (!convKey) return null;
            return { message: m, convKey };
        });
        const validList = resolvedList.filter((item): item is { message: IChatMessage; convKey: string } => item !== null);
        if (!validList.length) return;

        // 提取所有非空的 msgId 和 clientId，使用 Set 去重
        const msgIds = Array.from(new Set(validList.map(m => m.message.msgId).filter(Boolean))) as string[];
        const clientIds = Array.from(new Set(validList.map(m => m.message.clientId).filter(Boolean))) as string[];

        const existingPkMap = new Map<string, string>();
        const chunkSize = 900; // SQLite 一次 IN 查询变量安全上限

        // 批量查询存在的 msgId。
        // 注意：map 键必须与下方查找侧同域——统一用本地 session_key（convKey）。
        // 曾因此处误用 session_id（雪花列）建键导致查找永不命中、REPLACE 走
        // buildPk 的随机临时主键，把重复拉取的整页消息复制成多行。
        for (let i = 0; i < msgIds.length; i += chunkSize) {
            const chunk = msgIds.slice(i, i + chunkSize);
            const placeholders = chunk.map(() => '?').join(',');
            const rows = await dbBridge.query<{ pk: string, session_key: string, msg_id: string }>(
                'user',
                `SELECT pk, session_key, msg_id FROM chat_messages WHERE msg_id IN (${placeholders})`,
                chunk
            );
            for (const row of rows) {
                existingPkMap.set(`${row.session_key}:msg:${row.msg_id}`, row.pk);
            }
        }

        // 批量查询存在的 clientId
        for (let i = 0; i < clientIds.length; i += chunkSize) {
            const chunk = clientIds.slice(i, i + chunkSize);
            const placeholders = chunk.map(() => '?').join(',');
            const rows = await dbBridge.query<{ pk: string, session_key: string, client_id: string }>(
                'user',
                `SELECT pk, session_key, client_id FROM chat_messages WHERE client_id IN (${placeholders})`,
                chunk
            );
            for (const row of rows) {
                existingPkMap.set(`${row.session_key}:cli:${row.client_id}`, row.pk);
            }
        }

        const ops: Array<{ sql: string; params: unknown[] }> = [];

        for (const item of validList) {
            const { message, convKey } = item;
            const msgId = message.msgId || '';
            const clientId = message.clientId || '';
            // convKey 是本地 session_key；session_id 取消息原始值（空则保持空）
            const sessionId = message.sessionId || '';

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
                    (pk, session_id, session_key, msg_id, client_id, from_user_id, send_time, seq, type, status, is_read, data, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                params: [
                    pk,
                    sessionId,
                    convKey,
                    msgId,
                    clientId,
                    Number(message.fromUserId) || 0,
                    Number(message.sendTime) || Date.now(),
                    seqToBigInt(message.seq),
                    Number(message.type),
                    Number(message.status) || 0,
                    message.isRead ? 1 : 0,
                    JSON.stringify({ ...message, sessionId, sessionKey: convKey, seq: toSeq(message.seq) }),
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
        seq?: string
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
        
        if (seq !== undefined && seqPositive(seq)) {
            // seq 列绑 BigInt 精确存 int64；data JSON 内以 string 存，避免 JSON.parse 丢精度
            await dbBridge.execute(
                'user',
                `UPDATE chat_messages
                 SET status = ?, seq = ?, msg_id = COALESCE(NULLIF(msg_id, ''), ?), data = json_set(data, '$.status', ?, '$.seq', ?, '$.msgId', COALESCE(NULLIF(json_extract(data, '$.msgId'), ''), ?)), updated_at = ?
                 ${whereClause}`,
                [Number(status), seqToBigInt(seq), msgId || '', Number(status), toSeq(seq), msgId || '', Date.now(), whereParam]
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
        sessionKey: string,
        clientId: string,
        msgId: string,
        localPath: string
    ): Promise<void> {
        if (!sessionKey || (!clientId && !msgId)) return;

        const pk = await this.findExistingPk(sessionKey, msgId || '', clientId);
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
     * @param sessionKey 会话 Key（前端本地标识，如 private_123_456）
     * @param beforeSeq  排他性上界（Lamport seq 字符串）：只返回 seq > 0 且 seq < beforeSeq 的已确认消息；
     *                   undefined / '' / '0' 表示首页（无上界，含 seq=0 的未确认消息）
     * @param pageSize   每页条数
     * @returns          按 send_time 升序排列的消息（含已标记为失败的未确认消息）
     */
    async getLocalHistoryMessages(sessionKey: string, beforeSeq: string | undefined, pageSize: number): Promise<IChatMessage[]> {
        if (!sessionKey || pageSize <= 0) return [];

        const isFirstPage = !beforeSeq || !seqPositive(beforeSeq);
        // seq 比较在 SQLite 内以 int64 精确进行（参数绑定 BigInt）
        const seqCondition = isFirstPage ? `1 = 1` : `seq > 0 AND seq < ?`;
        const params: unknown[] = isFirstPage
            ? [sessionKey, pageSize]
            : [sessionKey, seqToBigInt(beforeSeq), pageSize];

        let rows = await dbBridge.query<MessageRow>(
            'user',
            `SELECT * FROM chat_messages
             WHERE session_key = ? AND (${seqCondition})
             ORDER BY send_time DESC
             LIMIT ?`,
            params
        );

        // 逻辑：加载历史时仍未获得服务端 ACK (seq === 0)，且不是正在发送状态，视为失败
        const failedStatus = MessageStatus.MESSAGE_STATUS_FAILED;
        const toFail = rows.filter(r => r.seq === 0 && r.status !== failedStatus && r.status !== MessageStatus.MESSAGE_STATUS_SENDING);

        if (toFail.length > 0) {
            const now = Date.now();
            const chunkSize = 900; // SQLite IN 子句变量安全上限
            for (let i = 0; i < toFail.length; i += chunkSize) {
                const chunk = toFail.slice(i, i + chunkSize);
                const placeholders = chunk.map(() => '?').join(',');
                await dbBridge.execute(
                    'user',
                    `UPDATE chat_messages
                     SET status = ?,
                         data = json_set(data, '$.status', ?),
                         updated_at = ?
                     WHERE pk IN (${placeholders})`,
                    [failedStatus, failedStatus, now, ...chunk.map(r => r.pk)]
                );
            }
            // 同步更新内存中的行，避免重新读取 DB
            for (const row of toFail) {
                row.status = failedStatus;
                try {
                    const data = JSON.parse(row.data) as Record<string, unknown>;
                    data.status = failedStatus;
                    row.data = JSON.stringify(data);
                } catch (e) {
                    console.error('[messageStore] getLocalHistoryMessages parse error:', e);
                }
            }
        }

        // DESC 查出最新→最旧，翻转为升序返回给前端
        return rows.reverse().map(rowToMessage);
    }

    /**
     * 清空某会话的所有消息
     */
    async clearMessagesBySessionId(sessionKey: string): Promise<void> {
        if (!sessionKey) return;
        // 优先按 session_key 删（含失败消息），同时用 OR 覆盖服务端 session_id 的旧数据
        await dbBridge.execute(
            'user',
            `DELETE FROM chat_messages WHERE session_key = ? OR session_id = ?`,
            [sessionKey, sessionKey]
        );
    }
}

export const messageStore = new MessageStore();
