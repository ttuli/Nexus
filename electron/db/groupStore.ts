import type Database from 'better-sqlite3';
import { getDb } from './database';
import type { ImTypes } from '@/src/types';

type GroupInfo = ImTypes.GroupInfo;

/**
 * group_info 表操作
 *
 * 表结构：
 *   id         INTEGER PRIMARY KEY
 *   owner_id   INTEGER -- 额外展开
 *   name       TEXT    -- 额外展开，便于本地搜索
 *   data       TEXT    -- JSON 全量数据
 *   expires_at INTEGER
 */
class GroupStore {
    private get db(): Database.Database {
        return getDb();
    }

    private get stmtGet() {
        return this.db.prepare<[number], { data: string; expires_at: number }>(
            'SELECT data, expires_at FROM group_info WHERE id = ?'
        );
    }

    private get stmtGetSingle() {
        return this.db.prepare<[number], { data: string; expires_at: number }>(
            'SELECT data, expires_at FROM group_info WHERE id = ?'
        );
    }

    private get stmtUpsert() {
        return this.db.prepare<[number, number, string, string, number]>(
            'INSERT OR REPLACE INTO group_info (id, owner_id, name, data, expires_at) VALUES (?, ?, ?, ?, ?)'
        );
    }

    private get stmtDelete() {
        return this.db.prepare<[number]>(
            'DELETE FROM group_info WHERE id = ?'
        );
    }

    private get stmtDeleteExpired() {
        return this.db.prepare<[number]>(
            'DELETE FROM group_info WHERE expires_at <= ?'
        );
    }

    private get stmtClear() {
        return this.db.prepare('DELETE FROM group_info');
    }

    // ── 公开 API ────────────────────────────────────────────────────────

    /**
     * 获取单个群组，已过期返回 null
     */
    get(groupId: number): GroupInfo | null {
        const row = this.stmtGet.get(groupId);
        if (!row || row.expires_at <= Date.now()) {
            if (row) this.stmtDelete.run(groupId);
            return null;
        }
        return JSON.parse(row.data) as GroupInfo;
    }

    /**
     * 批量获取群组，返回命中列表和缺失 ID 列表
     */
    getMany(groupIds: number[]): { found: GroupInfo[]; missing: number[] } {
        const now = Date.now();
        const found: GroupInfo[] = [];
        const missing: number[] = [];
        const stmt = this.stmtGetSingle;

        for (const groupId of groupIds) {
            const row = stmt.get(groupId);
            if (!row || row.expires_at <= now) {
                missing.push(groupId);
            } else {
                found.push(JSON.parse(row.data) as GroupInfo);
            }
        }
        return { found, missing };
    }

    /**
     * 写入单个群组
     */
    set(group: GroupInfo, expiresAt: number): void {
        this.stmtUpsert.run(
            group.id,
            group.owner_id,
            group.name,
            JSON.stringify(group),
            expiresAt
        );
    }

    /**
     * 批量写入群组（事务）
     */
    setMany(groups: GroupInfo[], expiresAt: number): void {
        const stmt = this.stmtUpsert;
        const runAll = this.db.transaction((items: GroupInfo[]) => {
            for (const group of items) {
                stmt.run(group.id, group.owner_id, group.name, JSON.stringify(group), expiresAt);
            }
        });
        runAll(groups);
    }

    /**
     * 删除单个群组
     */
    delete(groupId: number): void {
        this.stmtDelete.run(groupId);
    }

    /**
     * 清理所有过期记录
     */
    deleteExpired(): void {
        this.stmtDeleteExpired.run(Date.now());
    }

    /**
     * 清空整张表
     */
    clear(): void {
        this.stmtClear.run();
    }
}

export const groupStore = new GroupStore();
