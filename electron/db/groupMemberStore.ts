import { dbBridge } from './dbWorkerBridge';
import type { ImTypes } from '@shared/types';

type GroupMember = ImTypes.GroupMember;

/**
 * group_member 表操作（async）
 *
 * 表结构：
 *   group_id   INTEGER NOT NULL  -- 复合主键
 *   user_id    INTEGER NOT NULL  -- 复合主键
 *   data       TEXT    NOT NULL  -- JSON 单条 GroupMember 全量数据
 *   expires_at INTEGER NOT NULL
 *   PRIMARY KEY (group_id, user_id)
 */
class GroupMemberStore {
    /**
     * 获取指定群的所有未过期成员
     */
    async getByGroup(groupId: number): Promise<GroupMember[]> {
        const rows = await dbBridge.query<{ data: string }>(
            'shared',
            'SELECT data FROM group_member WHERE group_id = ? AND expires_at > ?',
            [groupId, Date.now()]
        );
        return rows.map(row => JSON.parse(row.data) as GroupMember);
    }

    /**
     * upsert 单条成员（替代旧的 Map 合并逻辑）
     * 相同 (group_id, user_id) 时自动覆盖
     */
    async upsert(member: GroupMember, expiresAt: number): Promise<void> {
        await dbBridge.execute(
            'shared',
            'INSERT OR REPLACE INTO group_member (group_id, user_id, data, expires_at) VALUES (?, ?, ?, ?)',
            [member.group_id, member.user_id, JSON.stringify(member), expiresAt]
        );
    }

    /**
     * 批量 upsert 成员（事务，原子性）
     */
    async upsertMany(members: GroupMember[], expiresAt: number): Promise<void> {
        if (!members.length) return;
        const ops = members.map(member => ({
            sql: 'INSERT OR REPLACE INTO group_member (group_id, user_id, data, expires_at) VALUES (?, ?, ?, ?)',
            params: [member.group_id, member.user_id, JSON.stringify(member), expiresAt] as unknown[],
        }));
        await dbBridge.transaction('shared', ops);
    }

    /**
     * 删除单条成员
     */
    async delete(groupId: number, userId: number): Promise<void> {
        await dbBridge.execute(
            'shared',
            'DELETE FROM group_member WHERE group_id = ? AND user_id = ?',
            [groupId, userId]
        );
    }

    /**
     * 删除某群的所有成员
     */
    async deleteByGroup(groupId: number): Promise<void> {
        await dbBridge.execute('shared', 'DELETE FROM group_member WHERE group_id = ?', [groupId]);
    }

    /**
     * 清理所有过期记录
     */
    async deleteExpired(): Promise<void> {
        await dbBridge.execute('shared', 'DELETE FROM group_member WHERE expires_at <= ?', [Date.now()]);
    }

    /**
     * 清空整张表
     */
    async clear(): Promise<void> {
        await dbBridge.execute('shared', 'DELETE FROM group_member', []);
    }
}

export const groupMemberStore = new GroupMemberStore();
