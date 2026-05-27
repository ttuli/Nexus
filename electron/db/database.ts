import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import schemaSql from './schema.sql?raw';
import { settingManager } from '../resource/settingManager';

let db: Database.Database | null = null;

/**
 * 获取 SQLite 数据库单例，首次调用时初始化所有表
 */
export function getDb(): Database.Database {
    if (db) return db;

    const dbDir = settingManager.getStoragePath();
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }
    const dbPath = path.join(dbDir, 'cache.db');
    db = new Database(dbPath);

    // WAL 模式：并发读写性能更好
    db.pragma('journal_mode = WAL');
    // 外键约束开启
    db.pragma('foreign_keys = ON');

    _initTables(db);

    return db;
}

/**
 * 关闭数据库连接（app 退出前调用）
 */
export function closeDb(): void {
    if (db) {
        db.close();
        db = null;
    }
}

/**
 * 初始化所有表结构
 */
function _initTables(db: Database.Database): void {
    db.exec(schemaSql);
}
