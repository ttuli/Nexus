import type Database from 'better-sqlite3';
import { getDb } from './database';

/**
 * 通用 KV 缓存表操作
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
    private get db(): Database.Database {
        return getDb();
    }

    private get stmtGet() {
        return this.db.prepare<[string, number], { data: string; expires_at: number }>(
            'SELECT data, expires_at FROM resource_cache WHERE type = ? AND id = ?'
        );
    }

    private get stmtGetSingle() {
        return this.db.prepare<[string, number], { data: string; expires_at: number }>(
            'SELECT data, expires_at FROM resource_cache WHERE type = ? AND id = ?'
        );
    }

    private get stmtGetAllByType() {
        return this.db.prepare<[string, number], { id: number; data: string }>(
            'SELECT id, data FROM resource_cache WHERE type = ? AND expires_at > ?'
        );
    }

    private get stmtGetAllIdsByType() {
        return this.db.prepare<[string, number], { id: number }>(
            'SELECT id FROM resource_cache WHERE type = ? AND expires_at > ?'
        );
    }

    private get stmtUpsert() {
        return this.db.prepare<[string, number, string, number]>(
            'INSERT OR REPLACE INTO resource_cache (type, id, data, expires_at) VALUES (?, ?, ?, ?)'
        );
    }

    private get stmtDelete() {
        return this.db.prepare<[string, number]>(
            'DELETE FROM resource_cache WHERE type = ? AND id = ?'
        );
    }

    private get stmtDeleteByType() {
        return this.db.prepare<[string]>(
            'DELETE FROM resource_cache WHERE type = ?'
        );
    }

    private get stmtDeleteExpired() {
        return this.db.prepare<[number]>(
            'DELETE FROM resource_cache WHERE expires_at <= ?'
        );
    }

    private get stmtClear() {
        return this.db.prepare('DELETE FROM resource_cache');
    }

    // ── 公开 API ────────────────────────────────────────────────────────

    /**
     * 获取单条记录，过期返回 null
     */
    get<T>(type: string, id: number): T | null {
        const row = this.stmtGet.get(type, id);
        if (!row || row.expires_at <= Date.now()) {
            if (row) this.stmtDelete.run(type, id);
            return null;
        }
        return JSON.parse(row.data) as T;
    }

    /**
     * 批量获取，返回命中列表和缺失 ID 列表
     */
    getMany<T>(type: string, ids: number[]): { found: T[]; missing: number[] } {
        const now = Date.now();
        const found: T[] = [];
        const missing: number[] = [];
        const stmt = this.stmtGetSingle;

        for (const id of ids) {
            const row = stmt.get(type, id);
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
    getAll<T>(type: string): T[] {
        const rows = this.stmtGetAllByType.all(type, Date.now());
        return rows.map(row => JSON.parse(row.data) as T);
    }

    /**
     * 获取某类型下所有未过期记录的 ID 列表
     * 专为 group_joined 设计（只需要 group_id 列表）
     */
    getAllIds(type: string): number[] {
        const rows = this.stmtGetAllIdsByType.all(type, Date.now());
        return rows.map(row => row.id);
    }

    /**
     * 写入单条记录
     */
    set(type: string, id: number, data: any, expiresAt: number): void {
        this.stmtUpsert.run(type, id, JSON.stringify(data), expiresAt);
    }

    /**
     * 批量写入（事务）
     */
    setMany(type: string, items: Array<{ id: number; data: any }>, expiresAt: number): void {
        const stmt = this.stmtUpsert;
        const runAll = this.db.transaction((entries: Array<{ id: number; data: any }>) => {
            for (const item of entries) {
                stmt.run(type, item.id, JSON.stringify(item.data), expiresAt);
            }
        });
        runAll(items);
    }

    /**
     * 删除单条记录
     */
    delete(type: string, id: number): void {
        this.stmtDelete.run(type, id);
    }

    /**
     * 删除某类型的所有记录
     */
    deleteByType(type: string): void {
        this.stmtDeleteByType.run(type);
    }

    /**
     * 清理所有过期记录
     */
    deleteExpired(): void {
        this.stmtDeleteExpired.run(Date.now());
    }

    /**
     * 清空表（可选按类型）
     */
    clear(type?: string): void {
        if (type) {
            this.stmtDeleteByType.run(type);
        } else {
            this.stmtClear.run();
        }
    }
}

export const kvCache = new KvCache();
