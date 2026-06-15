import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import sharedSchemaSql from './schema_shared.sql?raw';
import userSchemaSql from './schema_user.sql?raw';
import { settingManager } from '@/electron/resource/settingManager';

/**
 * 双库架构：
 *   sharedDb  → shared.db        存放公共数据（user_info, group_info, group_member）
 *               所有账户共享同一个文件，跨账户命中率高
 *   userDb    → {userId}.db      存放私有数据（resource_cache, chat_messages）
 *               每个账户独立一个文件，切换账号时重新打开
 */
let sharedDb: Database.Database | null = null;
let userDb: Database.Database | null = null;

// ── 公共数据库（shared.db）────────────────────────────────────────────────────

/**
 * 初始化共享数据库，app 启动时调用一次即可
 * shared.db 的生命周期与 app 相同，不随账号切换关闭
 */
export function openSharedDb(): void {
    if (sharedDb) return;

    const dbDir = settingManager.getStoragePath();
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }

    const dbPath = path.join(dbDir, 'shared.db');
    sharedDb = new Database(dbPath);
    sharedDb.pragma('journal_mode = WAL');
    sharedDb.pragma('foreign_keys = ON');
    sharedDb.exec(sharedSchemaSql);

    console.log(`[Database] Opened shared database: ${dbPath}`);
}

/**
 * 获取共享数据库实例
 * 必须在 openSharedDb() 之后调用
 */
export function getSharedDb(): Database.Database {
    if (!sharedDb) {
        throw new Error('[Database] Shared database is not open. Call openSharedDb() at app start.');
    }
    return sharedDb;
}

// ── 用户私有数据库（{userId}.db）─────────────────────────────────────────────

/**
 * 登录成功后调用，以 userId 为文件名打开（或创建）对应的私有 SQLite 数据库
 * 若已有连接则先关闭旧连接再重新打开（切换账号场景）
 */
export function openDb(userId: number): void {
    if (!userId) {
        throw new Error('[Database] openDb requires a valid userId');
    }

    // 切换账号时先关闭旧连接
    if (userDb) {
        userDb.close();
        userDb = null;
    }

    const dbDir = settingManager.getStoragePath();
    const userDbDir = path.join(dbDir, String(userId));
    if (!fs.existsSync(userDbDir)) {
        fs.mkdirSync(userDbDir, { recursive: true });
    }

    const dbPath = path.join(userDbDir, `${userId}.db`);
    userDb = new Database(dbPath);
    userDb.pragma('journal_mode = WAL');
    userDb.pragma('foreign_keys = ON');
    userDb.exec(userSchemaSql);

    console.log(`[Database] Opened user database for user ${userId}: ${dbPath}`);
}

/**
 * 获取当前已打开的用户私有数据库实例
 * 必须在 openDb() 之后调用，否则抛出错误
 */
export function getDb(): Database.Database {
    if (!userDb) {
        throw new Error('[Database] User database is not open. Call openDb(userId) after login first.');
    }
    return userDb;
}

/**
 * 关闭所有数据库连接（app 退出前调用）
 */
export function closeAllDb(): void {
    if (userDb) {
        userDb.close();
        userDb = null;
        console.log('[Database] User database connection closed.');
    }
    if (sharedDb) {
        sharedDb.close();
        sharedDb = null;
        console.log('[Database] Shared database connection closed.');
    }
}

export function closePrivateDB(): void {
    if (userDb) {
        userDb.close();
        userDb = null;
        console.log('[Database] User database connection closed.');
    }
}