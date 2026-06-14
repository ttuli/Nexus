import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import schemaSql from './schema.sql?raw';
import { settingManager } from '@/electron/resource/settingManager';

let db: Database.Database | null = null;

/**
 * 登录成功后调用，以 userId 为文件名打开（或创建）对应的 SQLite 数据库
 * 若已有连接则先关闭旧连接再重新打开（切换账号场景）
 */
export function openDb(userId: number): void {
    if (!userId) {
        throw new Error('[Database] openDb requires a valid userId');
    }

    // 切换账号时先关闭旧连接
    if (db) {
        db.close();
        db = null;
    }

    const dbDir = settingManager.getStoragePath();
    const userDbDir = path.join(dbDir, String(userId));
    if (!fs.existsSync(userDbDir)) {
        fs.mkdirSync(userDbDir, { recursive: true });
    }

    const dbPath = path.join(userDbDir, `${userId}.db`);
    db = new Database(dbPath);

    // WAL 模式：并发读写性能更好
    db.pragma('journal_mode = WAL');
    // 外键约束开启
    db.pragma('foreign_keys = ON');

    _initTables(db);

    console.log(`[Database] Opened database for user ${userId}: ${dbPath}`);
}

/**
 * 获取当前已打开的数据库实例
 * 必须在 openDb() 之后调用，否则抛出错误
 */
export function getDb(): Database.Database {
    if (!db) {
        throw new Error('[Database] Database is not open. Call openDb(userId) after login first.');
    }
    return db;
}

/**
 * 关闭数据库连接（退出登录 / app 退出前调用）
 */
export function closeDb(): void {
    if (db) {
        db.close();
        db = null;
        console.log('[Database] Database connection closed.');
    }
}

/**
 * 初始化所有表结构
 */
function _initTables(db: Database.Database): void {
    db.exec(schemaSql);
}
