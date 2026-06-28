/**
 * db.worker.ts
 *
 * Worker Thread 主体：在独立线程中持有 better-sqlite3 数据库连接。
 * 主进程通过 postMessage / on('message') 与此 Worker 通信。
 *
 * 消息协议（接收）：
 *   { id, type: 'open_shared', dbDir, sharedSql }
 *   { id, type: 'open_user',   dbDir, userId, userSql }
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
import Database from 'better-sqlite3';
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

// ── 消息处理 ─────────────────────────────────────────────────────────────────

parentPort.on('message', (msg: WorkerMessage) => {
    const { id, type } = msg;

    try {
        switch (type) {
            // ── 生命周期 ─────────────────────────────────────────────────────

            case 'open_shared': {
                if (sharedDb) { reply(id, null); break; }
                const { dbDir, sharedSql } = msg as OpenSharedMsg;
                if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
                const dbPath = path.join(dbDir, 'shared.db');
                sharedDb = new Database(dbPath);
                sharedDb.pragma('journal_mode = WAL');
                sharedDb.pragma('foreign_keys = ON');
                sharedDb.exec(sharedSql);
                console.log(`[db.worker] Opened shared database: ${dbPath}`);
                reply(id, null);
                break;
            }

            case 'open_user': {
                const { dbDir, userId, userSql } = msg as OpenUserMsg;
                // 切换账号时关闭旧连接
                if (userDb) { userDb.close(); userDb = null; }
                const userDbDir = path.join(dbDir, String(userId));
                if (!fs.existsSync(userDbDir)) fs.mkdirSync(userDbDir, { recursive: true });
                const dbPath = path.join(userDbDir, `${userId}.db`);
                userDb = new Database(dbPath);
                userDb.pragma('journal_mode = WAL');
                userDb.pragma('foreign_keys = ON');
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
                const rows = db.prepare(sql).all(...(params ?? []));
                reply(id, rows);
                break;
            }

            // ── 查询（返回单行） ─────────────────────────────────────────────

            case 'get': {
                const { db: target, sql, params } = msg as GetMsg;
                const db = getDb(target);
                const row = db.prepare(sql).get(...(params ?? [])) ?? null;
                reply(id, row);
                break;
            }

            // ── 写入（run，返回 { changes, lastInsertRowid }） ────────────────

            case 'execute': {
                const { db: target, sql, params } = msg as ExecuteMsg;
                const db = getDb(target);
                const info = db.prepare(sql).run(...(params ?? []));
                reply(id, { changes: info.changes, lastInsertRowid: info.lastInsertRowid });
                break;
            }

            // ── 批量事务（原子执行多条 SQL） ──────────────────────────────────

            case 'transaction': {
                const { db: target, ops } = msg as TransactionMsg;
                const db = getDb(target);
                const runAll = db.transaction((operations: TransactionOp[]) => {
                    for (const op of operations) {
                        db.prepare(op.sql).run(...(op.params ?? []));
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
}

interface OpenUserMsg extends BaseMsg {
    type: 'open_user';
    dbDir: string;
    userId: number;
    userSql: string;
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
