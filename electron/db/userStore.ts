import type Database from 'better-sqlite3';
import { getDb } from './database';
import type { ImTypes } from '../../src/types';

type UserInfo = ImTypes.UserInfo;

/**
 * user_info 表操作
 *
 * 表结构：
 *   user_id    INTEGER PRIMARY KEY
 *   user_name  TEXT    -- 额外展开，便于本地搜索
 *   data       TEXT    -- JSON 全量数据
 *   expires_at INTEGER
 */
class UserStore {
    private get db(): Database.Database {
        return getDb();
    }

    // ── 预编译语句（懒初始化，避免 getDb() 未准备好时调用） ──────────

    private get stmtGet() {
        return this.db.prepare<[number], { data: string; expires_at: number }>(
            'SELECT data, expires_at FROM user_info WHERE user_id = ?'
        );
    }

    private get stmtGetMany() {
        // SQLite 不支持动态参数列表，getMany 用事务逐条查询
        return this.db.prepare<[number], { data: string; expires_at: number }>(
            'SELECT data, expires_at FROM user_info WHERE user_id = ?'
        );
    }

    private get stmtUpsert() {
        return this.db.prepare<[number, string, string, number]>(
            'INSERT OR REPLACE INTO user_info (user_id, user_name, data, expires_at) VALUES (?, ?, ?, ?)'
        );
    }

    private get stmtDelete() {
        return this.db.prepare<[number]>(
            'DELETE FROM user_info WHERE user_id = ?'
        );
    }

    private get stmtDeleteExpired() {
        return this.db.prepare<[number]>(
            'DELETE FROM user_info WHERE expires_at <= ?'
        );
    }

    private get stmtClear() {
        return this.db.prepare('DELETE FROM user_info');
    }

    // ── 公开 API ────────────────────────────────────────────────────────

    /**
     * 获取单个用户，已过期返回 null
     */
    get(userId: number): UserInfo | null {
        const row = this.stmtGet.get(userId);
        if (!row || row.expires_at <= Date.now()) {
            if (row) this.stmtDelete.run(userId);
            return null;
        }
        return JSON.parse(row.data) as UserInfo;
    }

    /**
     * 批量获取用户，返回命中列表和缺失 ID 列表
     */
    getMany(userIds: number[]): { found: UserInfo[]; missing: number[] } {
        const now = Date.now();
        const found: UserInfo[] = [];
        const missing: number[] = [];
        const stmt = this.stmtGetMany;

        for (const userId of userIds) {
            const row = stmt.get(userId);
            if (!row || row.expires_at <= now) {
                missing.push(userId);
            } else {
                found.push(JSON.parse(row.data) as UserInfo);
            }
        }
        return { found, missing };
    }

    /**
     * 写入单个用户
     */
    set(user: UserInfo, expiresAt: number): void {
        this.stmtUpsert.run(
            user.user_id,
            user.user_name,
            JSON.stringify(user),
            expiresAt
        );
    }

    /**
     * 批量写入用户（事务）
     */
    setMany(users: UserInfo[], expiresAt: number): void {
        const stmt = this.stmtUpsert;
        const runAll = this.db.transaction((items: UserInfo[]) => {
            for (const user of items) {
                stmt.run(user.user_id, user.user_name, JSON.stringify(user), expiresAt);
            }
        });
        runAll(users);
    }

    /**
     * 删除单个用户
     */
    delete(userId: number): void {
        this.stmtDelete.run(userId);
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

export const userStore = new UserStore();
