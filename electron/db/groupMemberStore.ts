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
     * 获取指定群的所有成员（整组有效性判定）
     *
     * 同群成员行的 expires_at 可能不一致（单成员 upsert 会只刷新自己那行的 TTL），
     * 若按行过滤过期行会返回"缺人"的部分列表并被上层当作缓存命中。
     * 因此任一成员行过期即视为整组失效，返回空让上层回源全量拉取。
     */
    async getByGroup(groupId: number): Promise<GroupMember[]> {
        const rows = await dbBridge.query<{ data: string; expires_at: number }>(
            'shared',
            'SELECT data, expires_at FROM group_member WHERE group_id = ?',
            [groupId]
        );
        if (rows.length === 0) return [];
        const now = Date.now();
        if (rows.some(row => row.expires_at <= now)) return [];
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
     * 批量删除某群的指定成员（事务，原子性）
     */
    async deleteMany(groupId: number, userIds: number[]): Promise<void> {
        if (!userIds.length) return;
        const ops = userIds.map(userId => ({
            sql: 'DELETE FROM group_member WHERE group_id = ? AND user_id = ?',
            params: [groupId, userId] as unknown[],
        }));
        await dbBridge.transaction('shared', ops);
    }

    /**
     * 以服务端全量列表原子替换某群的成员缓存（删除 + 插入同一事务）。
     * 与 upsertMany 的区别：能清掉已不在群内的残留成员行。
     */
    async replaceGroup(groupId: number, members: GroupMember[], expiresAt: number): Promise<void> {
        const ops: { sql: string; params: unknown[] }[] = [
            { sql: 'DELETE FROM group_member WHERE group_id = ?', params: [groupId] },
            ...members.map(member => ({
                sql: 'INSERT OR REPLACE INTO group_member (group_id, user_id, data, expires_at) VALUES (?, ?, ?, ?)',
                params: [groupId, member.user_id, JSON.stringify(member), expiresAt] as unknown[],
            })),
        ];
        await dbBridge.transaction('shared', ops);
    }

    /**
     * 删除某群的所有成员
     */
    async deleteByGroup(groupId: number): Promise<void> {
        await dbBridge.execute('shared', 'DELETE FROM group_member WHERE group_id = ?', [groupId]);
    }

    /**
     * 清理过期记录（按组粒度：组内任一行过期则整组删除，与 getByGroup 的整组有效性判定一致）
     */
    async deleteExpired(): Promise<void> {
        await dbBridge.execute(
            'shared',
            'DELETE FROM group_member WHERE group_id IN (SELECT DISTINCT group_id FROM group_member WHERE expires_at <= ?)',
            [Date.now()]
        );
    }

    /**
     * 清空整张表
     */
    async clear(): Promise<void> {
        await dbBridge.execute('shared', 'DELETE FROM group_member', []);
    }
}

export const groupMemberStore = new GroupMemberStore();
