import { dbBridge } from './dbWorkerBridge';
import type { ImTypes } from '@shared/types';

type GroupInfo = ImTypes.GroupInfo;

/**
 * group_info 表操作（async）
 *
 * 表结构：
 *   id         INTEGER PRIMARY KEY
 *   owner_id   INTEGER -- 额外展开
 *   name       TEXT    -- 额外展开，便于本地搜索
 *   data       TEXT    -- JSON 全量数据
 *   expires_at INTEGER
 */
class GroupStore {
    /**
     * 获取单个群组，已过期返回 null
     */
    async get(groupId: number): Promise<GroupInfo | null> {
        const row = await dbBridge.get<{ data: string; expires_at: number }>(
            'shared',
            'SELECT data, expires_at FROM group_info WHERE id = ?',
            [groupId]
        );
        if (!row || row.expires_at <= Date.now()) {
            if (row) await this.delete(groupId);
            return null;
        }
        return JSON.parse(row.data) as GroupInfo;
    }

    /**
     * 批量获取群组，返回命中列表和缺失 ID 列表
     */
    async getMany(groupIds: number[]): Promise<{ found: GroupInfo[]; missing: number[] }> {
        const now = Date.now();
        const found: GroupInfo[] = [];
        const missing: number[] = [];

        for (const groupId of groupIds) {
            const row = await dbBridge.get<{ data: string; expires_at: number }>(
                'shared',
                'SELECT data, expires_at FROM group_info WHERE id = ?',
                [groupId]
            );
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
    async set(group: GroupInfo, expiresAt: number): Promise<void> {
        await dbBridge.execute(
            'shared',
            'INSERT OR REPLACE INTO group_info (id, owner_id, name, data, expires_at) VALUES (?, ?, ?, ?, ?)',
            [group.id, group.owner_id, group.name, JSON.stringify(group), expiresAt]
        );
    }

    /**
     * 批量写入群组（事务）
     */
    async setMany(groups: GroupInfo[], expiresAt: number): Promise<void> {
        if (!groups.length) return;
        const ops = groups.map(group => ({
            sql: 'INSERT OR REPLACE INTO group_info (id, owner_id, name, data, expires_at) VALUES (?, ?, ?, ?, ?)',
            params: [group.id, group.owner_id, group.name, JSON.stringify(group), expiresAt] as unknown[],
        }));
        await dbBridge.transaction('shared', ops);
    }

    /**
     * 删除单个群组
     */
    async delete(groupId: number): Promise<void> {
        await dbBridge.execute('shared', 'DELETE FROM group_info WHERE id = ?', [groupId]);
    }

    /**
     * 清理所有过期记录
     */
    async deleteExpired(): Promise<void> {
        await dbBridge.execute('shared', 'DELETE FROM group_info WHERE expires_at <= ?', [Date.now()]);
    }

    /**
     * 清空整张表
     */
    async clear(): Promise<void> {
        await dbBridge.execute('shared', 'DELETE FROM group_info', []);
    }
}

export const groupStore = new GroupStore();
