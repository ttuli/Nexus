import { dbBridge } from './dbWorkerBridge';

/**
 * 通用 KV 缓存表操作（async）
 *
 * 表结构：
 *   type       TEXT    NOT NULL  -- 'friend' | 'group_joined'
 *   id         INTEGER NOT NULL  -- friend_id 或 group_id
 *   data       TEXT    NOT NULL  -- JSON 序列化数据
 *   expires_at INTEGER NOT NULL
 *   PRIMARY KEY (type, id)
 *
 * 用于：friend、group_joined
 * 不缓存：friend_request、group_apply
 */
class KvCache {
    // ── 公开 API ────────────────────────────────────────────────────────

    /**
     * 获取单条记录，过期返回 null
     */
    async get<T>(type: string, id: number): Promise<T | null> {
        const row = await dbBridge.get<{ data: string; expires_at: number }>(
            'user',
            'SELECT data, expires_at FROM resource_cache WHERE type = ? AND id = ?',
            [type, id]
        );
        if (!row || row.expires_at <= Date.now()) {
            if (row) await this.delete(type, id);
            return null;
        }
        return JSON.parse(row.data) as T;
    }

    /**
     * 批量获取，返回命中列表和缺失 ID 列表
     */
    async getMany<T>(type: string, ids: number[]): Promise<{ found: T[]; missing: number[] }> {
        const now = Date.now();
        const found: T[] = [];
        const missing: number[] = [];

        for (const id of ids) {
            const row = await dbBridge.get<{ data: string; expires_at: number }>(
                'user',
                'SELECT data, expires_at FROM resource_cache WHERE type = ? AND id = ?',
                [type, id]
            );
            if (!row || row.expires_at <= now) {
                missing.push(id);
            } else {
                found.push(JSON.parse(row.data) as T);
            }
        }
        return { found, missing };
    }

    /**
     * 获取某类型下所有未过期记录
     */
    async getAll<T>(type: string): Promise<T[]> {
        const rows = await dbBridge.query<{ data: string }>(
            'user',
            'SELECT id, data FROM resource_cache WHERE type = ? AND expires_at > ?',
            [type, Date.now()]
        );
        return rows.map(row => JSON.parse(row.data) as T);
    }

    /**
     * 获取某类型下所有未过期记录的 ID 列表
     * 专为 group_joined 设计（只需要 group_id 列表）
     */
    async getAllIds(type: string): Promise<number[]> {
        const rows = await dbBridge.query<{ id: number }>(
            'user',
            'SELECT id FROM resource_cache WHERE type = ? AND expires_at > ?',
            [type, Date.now()]
        );
        return rows.map(row => row.id);
    }

    /**
     * 写入单条记录
     */
    async set(type: string, id: number, data: any, expiresAt: number): Promise<void> {
        await dbBridge.execute(
            'user',
            'INSERT OR REPLACE INTO resource_cache (type, id, data, expires_at) VALUES (?, ?, ?, ?)',
            [type, id, JSON.stringify(data), expiresAt]
        );
    }

    /**
     * 批量写入（事务）
     */
    async setMany(type: string, items: Array<{ id: number; data: any }>, expiresAt: number): Promise<void> {
        if (!items.length) return;
        const ops = items.map(item => ({
            sql: 'INSERT OR REPLACE INTO resource_cache (type, id, data, expires_at) VALUES (?, ?, ?, ?)',
            params: [type, item.id, JSON.stringify(item.data), expiresAt] as unknown[],
        }));
        await dbBridge.transaction('user', ops);
    }

    /**
     * 删除单条记录
     */
    async delete(type: string, id: number): Promise<void> {
        await dbBridge.execute(
            'user',
            'DELETE FROM resource_cache WHERE type = ? AND id = ?',
            [type, id]
        );
    }

    /**
     * 删除某类型的所有记录
     */
    async deleteByType(type: string): Promise<void> {
        await dbBridge.execute('user', 'DELETE FROM resource_cache WHERE type = ?', [type]);
    }

    /**
     * 清理所有过期记录
     */
    async deleteExpired(): Promise<void> {
        await dbBridge.execute('user', 'DELETE FROM resource_cache WHERE expires_at <= ?', [Date.now()]);
    }

    /**
     * 清空表（可选按类型）
     */
    async clear(type?: string): Promise<void> {
        if (type) {
            await this.deleteByType(type);
        } else {
            await dbBridge.execute('user', 'DELETE FROM resource_cache', []);
        }
    }
}

export const kvCache = new KvCache();
