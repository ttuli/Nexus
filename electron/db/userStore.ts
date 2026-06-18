import { dbBridge } from './dbWorkerBridge';
import type { ImTypes } from '@/src/types';

type UserInfo = ImTypes.UserInfo;

/**
 * user_info 表操作（async）
 *
 * 表结构：
 *   user_id    INTEGER PRIMARY KEY
 *   user_name  TEXT    -- 额外展开，便于本地搜索
 *   data       TEXT    -- JSON 全量数据
 *   expires_at INTEGER
 */
class UserStore {
    // ── 公开 API ────────────────────────────────────────────────────────

    /**
     * 获取单个用户，已过期返回 null
     */
    async get(userId: number): Promise<UserInfo | null> {
        const row = await dbBridge.get<{ data: string; expires_at: number }>(
            'shared',
            'SELECT data, expires_at FROM user_info WHERE user_id = ?',
            [userId]
        );
        if (!row || row.expires_at <= Date.now()) {
            if (row) await this.delete(userId);
            return null;
        }
        return JSON.parse(row.data) as UserInfo;
    }

    /**
     * 批量获取用户，返回命中列表和缺失 ID 列表
     */
    async getMany(userIds: number[]): Promise<{ found: UserInfo[]; missing: number[] }> {
        const now = Date.now();
        const found: UserInfo[] = [];
        const missing: number[] = [];

        for (const userId of userIds) {
            const row = await dbBridge.get<{ data: string; expires_at: number }>(
                'shared',
                'SELECT data, expires_at FROM user_info WHERE user_id = ?',
                [userId]
            );
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
    async set(user: UserInfo, expiresAt: number): Promise<void> {
        await dbBridge.execute(
            'shared',
            'INSERT OR REPLACE INTO user_info (user_id, user_name, data, expires_at) VALUES (?, ?, ?, ?)',
            [user.user_id, user.user_name, JSON.stringify(user), expiresAt]
        );
    }

    /**
     * 批量写入用户（事务）
     */
    async setMany(users: UserInfo[], expiresAt: number): Promise<void> {
        if (!users.length) return;
        const ops = users.map(user => ({
            sql: 'INSERT OR REPLACE INTO user_info (user_id, user_name, data, expires_at) VALUES (?, ?, ?, ?)',
            params: [user.user_id, user.user_name, JSON.stringify(user), expiresAt] as unknown[],
        }));
        await dbBridge.transaction('shared', ops);
    }

    /**
     * 删除单个用户
     */
    async delete(userId: number): Promise<void> {
        await dbBridge.execute('shared', 'DELETE FROM user_info WHERE user_id = ?', [userId]);
    }

    /**
     * 清理所有过期记录
     */
    async deleteExpired(): Promise<void> {
        await dbBridge.execute('shared', 'DELETE FROM user_info WHERE expires_at <= ?', [Date.now()]);
    }

    /**
     * 清空整张表
     */
    async clear(): Promise<void> {
        await dbBridge.execute('shared', 'DELETE FROM user_info', []);
    }
}

export const userStore = new UserStore();
