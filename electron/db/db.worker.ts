/**
 * db.worker.ts
 *
 * Worker Thread 主体：在独立线程中持有 better-sqlite3-multiple-ciphers 数据库连接。
 * 主进程通过 postMessage / on('message') 与此 Worker 通信。
 *
 * 数据库为 SQLCipher 整库加密（better-sqlite3-multiple-ciphers），
 * 密钥由主进程通过 open_shared / open_user 消息传入，Worker 不接触密钥的存取。
 *
 * 消息协议（接收）：
 *   { id, type: 'open_shared', dbDir, sharedSql, key }
 *   { id, type: 'open_user',   dbDir, userId, userSql, key }
 *   { id, type: 'close_user' }
 *   { id, type: 'close_all' }
 *   { id, type: 'query',       db: 'shared'|'user', sql, params }
 *   { id, type: 'get',         db: 'shared'|'user', sql, params }
 *   { id, type: 'execute',     db: 'shared'|'user', sql, params }
 *   { id, type: 'transaction', db: 'shared'|'user', ops: Array<{sql, params}> }
 *
 * 消息协议（发送）：
 *   { id, result }   —— 成功
 *   { id, error }    —— 失败（字符串）
 */

import { parentPort } from 'worker_threads';
import Database from 'better-sqlite3-multiple-ciphers';
import path from 'path';
import fs from 'fs';

if (!parentPort) {
    throw new Error('[db.worker] Must be run as a Worker Thread');
}

// ── 数据库实例 ────────────────────────────────────────────────────────────────

let sharedDb: Database.Database | null = null;
let userDb: Database.Database | null = null;

// ── 辅助 ─────────────────────────────────────────────────────────────────────

function getDb(target: 'shared' | 'user'): Database.Database {
    if (target === 'shared') {
        if (!sharedDb) throw new Error('[db.worker] sharedDb is not open');
        return sharedDb;
    }
    if (!userDb) throw new Error('[db.worker] userDb is not open');
    return userDb;
}

function reply(id: number, result: unknown): void {
    parentPort!.postMessage({ id, result });
}

function replyError(id: number, err: unknown): void {
    const msg = err instanceof Error ? err.message : String(err);
    parentPort!.postMessage({ id, error: msg });
}

/**
 * 挂载 SQLCipher 密钥。
 *
 * PRAGMA 顺序有硬性要求：cipher / key 必须是连接建立后的第一批语句，
 * 排在 journal_mode 等其它 pragma 之前，否则 SQLCipher 无法正确接管文件。
 * 密钥以 x'...' 裸密钥形式传入，跳过 SQLCipher v4 默认的 256000 轮 PBKDF2，
 * 否则每次开库都要重跑一遍，冷启动会明显变慢。
 */
function applyCipher(db: Database.Database, keyHex: string): void {
    db.pragma(`cipher='sqlcipher'`);
    db.pragma(`key="x'${keyHex}'"`);
}

/**
 * 校验密钥能否解开该库。
 *
 * SQLCipher 在密钥错误时不会在 open 阶段报错，而是在第一次真正读页时
 * 抛 "file is not a database"，所以必须主动读一次。
 * 新建的空库（0 字节）此处会正常返回，密钥在首次写入时才真正落到文件头。
 */
function canDecrypt(db: Database.Database): boolean {
    try {
        db.prepare('SELECT count(*) FROM sqlite_master').get();
        return true;
    } catch {
        return false;
    }
}

/**
 * 打开一个加密数据库；密钥对不上时把旧文件改名让开，并重建空库。
 *
 * 解不开通常意味着换了系统账户或换了机器（safeStorage 的密钥跟着走不了），
 * 也可能是文件损坏。这里不删数据——万一哪天原系统账户恢复了还能解开——
 * 只改名归档，让应用能继续跑起来（消息可由服务端按 seq 重新拉取）。
 */
function openEncryptedDb(dbPath: string, keyHex: string, label: string): Database.Database {
    let db = new Database(dbPath);
    applyCipher(db, keyHex);

    if (!canDecrypt(db)) {
        db.close();
        const orphan = `${dbPath}.orphan-${Date.now()}`;
        try {
            fs.renameSync(dbPath, orphan);
            // WAL/SHM 一并归档，避免残留文件干扰新库
            for (const suffix of ['-wal', '-shm']) {
                if (fs.existsSync(dbPath + suffix)) fs.renameSync(dbPath + suffix, orphan + suffix);
            }
        } catch (err) {
            throw new Error(`[db.worker] ${label} 无法解密，且归档失败: ${err instanceof Error ? err.message : String(err)}`);
        }
        console.error(
            `[db.worker] ${label} 无法用当前密钥解开，已归档为 ${path.basename(orphan)} 并重建空库。`
        );
        db = new Database(dbPath);
        applyCipher(db, keyHex);
    }

    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    return db;
}

/** 将参数列表中每个值强制转换为 better-sqlite3 接受的类型 */
function safeParams(params: unknown[]): unknown[] {
    return params.map(p => {
        if (p === null || p === undefined) return null;
        if (typeof p === 'number' || typeof p === 'string' || typeof p === 'bigint') return p;
        if (Buffer.isBuffer(p)) return p;
        // 其它类型（包括数组/对象）序列化为 JSON 字符串
        return String(p);
    });
}

// ── 消息处理 ─────────────────────────────────────────────────────────────────

parentPort.on('message', (msg: WorkerMessage) => {
    const { id, type } = msg;

    try {
        switch (type) {
            // ── 生命周期 ─────────────────────────────────────────────────────

            case 'open_shared': {
                if (sharedDb) { reply(id, null); break; }
                const { dbDir, sharedSql, key } = msg as OpenSharedMsg;
                if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
                const dbPath = path.join(dbDir, 'shared.db');
                sharedDb = openEncryptedDb(dbPath, key, 'shared.db');
                sharedDb.exec(sharedSql);
                console.log(`[db.worker] Opened shared database: ${dbPath}`);
                reply(id, null);
                break;
            }

            case 'open_user': {
                const { dbDir, userId, userSql, key } = msg as OpenUserMsg;
                // 切换账号时关闭旧连接
                if (userDb) { userDb.close(); userDb = null; }
                const userDbDir = path.join(dbDir, String(userId));
                if (!fs.existsSync(userDbDir)) fs.mkdirSync(userDbDir, { recursive: true });
                const dbPath = path.join(userDbDir, `${userId}.db`);
                userDb = openEncryptedDb(dbPath, key, `user ${userId} database`);
                userDb.exec(userSql);

                console.log(`[db.worker] Opened user database for user ${userId}: ${dbPath}`);
                reply(id, null);
                break;
            }

            case 'close_user': {
                if (userDb) { userDb.close(); userDb = null; }
                console.log('[db.worker] User database closed.');
                reply(id, null);
                break;
            }

            case 'close_all': {
                if (userDb) { userDb.close(); userDb = null; }
                if (sharedDb) { sharedDb.close(); sharedDb = null; }
                console.log('[db.worker] All databases closed.');
                reply(id, null);
                break;
            }

            // ── 查询（返回所有行） ────────────────────────────────────────────

            case 'query': {
                const { db: target, sql, params } = msg as QueryMsg;
                const db = getDb(target);
                const rows = db.prepare(sql).all(...(params ? safeParams(params) : []));
                reply(id, rows);
                break;
            }

            // ── 查询（返回单行） ─────────────────────────────────────────────

            case 'get': {
                const { db: target, sql, params } = msg as GetMsg;
                const db = getDb(target);
                const row = db.prepare(sql).get(...(params ? safeParams(params) : [])) ?? null;
                reply(id, row);
                break;
            }

            // ── 写入（run，返回 { changes, lastInsertRowid }） ────────────────

            case 'execute': {
                const { db: target, sql, params } = msg as ExecuteMsg;
                const db = getDb(target);
                const info = db.prepare(sql).run(...(params ? safeParams(params) : []));
                reply(id, { changes: info.changes, lastInsertRowid: info.lastInsertRowid });
                break;
            }

            // ── 批量事务（原子执行多条 SQL） ──────────────────────────────────

            case 'transaction': {
                const { db: target, ops } = msg as TransactionMsg;
                const db = getDb(target);
                const runAll = db.transaction((operations: TransactionOp[]) => {
                    for (const op of operations) {
                        db.prepare(op.sql).run(...(op.params ? safeParams(op.params) : []));
                    }
                });
                runAll(ops);
                reply(id, null);
                break;
            }

            default:
                replyError(id, `[db.worker] Unknown message type: ${type}`);
        }
    } catch (err) {
        replyError(id, err);
    }
});

// ── 消息类型定义 ──────────────────────────────────────────────────────────────

interface BaseMsg {
    id: number;
    type: string;
}

interface OpenSharedMsg extends BaseMsg {
    type: 'open_shared';
    dbDir: string;
    sharedSql: string;
    /** SQLCipher 密钥（32 字节 hex），由主进程从 dbKeyManager 取得 */
    key: string;
}

interface OpenUserMsg extends BaseMsg {
    type: 'open_user';
    dbDir: string;
    userId: number;
    userSql: string;
    /** SQLCipher 密钥（32 字节 hex），每个账号一把 */
    key: string;
}

interface QueryMsg extends BaseMsg {
    type: 'query';
    db: 'shared' | 'user';
    sql: string;
    params?: unknown[];
}

interface GetMsg extends BaseMsg {
    type: 'get';
    db: 'shared' | 'user';
    sql: string;
    params?: unknown[];
}

interface ExecuteMsg extends BaseMsg {
    type: 'execute';
    db: 'shared' | 'user';
    sql: string;
    params?: unknown[];
}

interface TransactionOp {
    sql: string;
    params?: unknown[];
}

interface TransactionMsg extends BaseMsg {
    type: 'transaction';
    db: 'shared' | 'user';
    ops: TransactionOp[];
}

type WorkerMessage =
    | OpenSharedMsg
    | OpenUserMsg
    | BaseMsg   // close_user / close_all
    | QueryMsg
    | GetMsg
    | ExecuteMsg
    | TransactionMsg;
