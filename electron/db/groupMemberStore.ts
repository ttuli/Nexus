import type Database from 'better-sqlite3';
import { getSharedDb } from './database';
import type { ImTypes } from '@/src/types';

type GroupMember = ImTypes.GroupMember;

/**
 * group_member 表操作
 *
 * 表结构：
 *   group_id   INTEGER NOT NULL  -- 复合主键
 *   user_id    INTEGER NOT NULL  -- 复合主键
 *   data       TEXT    NOT NULL  -- JSON 单条 GroupMember 全量数据
 *   expires_at INTEGER NOT NULL
 *   PRIMARY KEY (group_id, user_id)
 *
 * 优势：单成员直接 upsert，替代旧的 JS Map 合并逻辑
 */
class GroupMemberStore {
    private get db(): Database.Database {
        return getSharedDb();
    }

    private get stmtGetByGroup() {
        return this.db.prepare<[number, number], { data: string }>(
            'SELECT data FROM group_member WHERE group_id = ? AND expires_at > ?'
        );
    }

    private get stmtUpsert() {
        return this.db.prepare<[number, number, string, number]>(
            'INSERT OR REPLACE INTO group_member (group_id, user_id, data, expires_at) VALUES (?, ?, ?, ?)'
        );
    }

    private get stmtDelete() {
        return this.db.prepare<[number, number]>(
            'DELETE FROM group_member WHERE group_id = ? AND user_id = ?'
        );
    }

    private get stmtDeleteByGroup() {
        return this.db.prepare<[number]>(
            'DELETE FROM group_member WHERE group_id = ?'
        );
    }

    private get stmtDeleteExpired() {
        return this.db.prepare<[number]>(
            'DELETE FROM group_member WHERE expires_at <= ?'
        );
    }

    private get stmtClear() {
        return this.db.prepare('DELETE FROM group_member');
    }

    // ── 公开 API ────────────────────────────────────────────────────────

    /**
     * 获取指定群的所有未过期成员
     */
    getByGroup(groupId: number): GroupMember[] {
        const rows = this.stmtGetByGroup.all(groupId, Date.now());
        return rows.map(row => JSON.parse(row.data) as GroupMember);
    }

    /**
     * upsert 单条成员（替代旧的 Map 合并逻辑）
     * 相同 (group_id, user_id) 时自动覆盖
     */
    upsert(member: GroupMember, expiresAt: number): void {
        this.stmtUpsert.run(
            member.group_id,
            member.user_id,
            JSON.stringify(member),
            expiresAt
        );
    }

    /**
     * 批量 upsert 成员（事务，原子性）
     */
    upsertMany(members: GroupMember[], expiresAt: number): void {
        const stmt = this.stmtUpsert;
        const runAll = this.db.transaction((items: GroupMember[]) => {
            for (const member of items) {
                stmt.run(member.group_id, member.user_id, JSON.stringify(member), expiresAt);
            }
        });
        runAll(members);
    }

    /**
     * 删除单条成员
     */
    delete(groupId: number, userId: number): void {
        this.stmtDelete.run(groupId, userId);
    }

    /**
     * 删除某群的所有成员
     */
    deleteByGroup(groupId: number): void {
        this.stmtDeleteByGroup.run(groupId);
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

export const groupMemberStore = new GroupMemberStore();
