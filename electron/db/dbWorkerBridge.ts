/**
 * dbWorkerBridge.ts
 *
 * 主进程侧桥接层：将所有 SQLite 操作通过 Worker Thread 异步化。
 *
 * 用法：
 *   import { dbBridge } from './dbWorkerBridge';
 *   await dbBridge.openSharedDb();
 *   await dbBridge.openDb(userId);
 *   const rows = await dbBridge.query('shared', 'SELECT * FROM user_info WHERE user_id = ?', [id]);
 *   await dbBridge.execute('user', 'INSERT ...', [...]);
 *   await dbBridge.transaction('user', [{ sql: '...', params: [...] }, ...]);
 *   await dbBridge.closeAllDb();
 */

import { Worker } from 'worker_threads';
import path from 'path';
import { fileURLToPath } from 'url';
import { settingManager } from '@/electron/resource/settingManager';

// ── 消息类型（与 db.worker.ts 中的定义镜像） ─────────────────────────────────

export interface TransactionOp {
    sql: string;
    params?: unknown[];
}

type DbTarget = 'shared' | 'user';

interface PendingEntry {
    resolve: (value: unknown) => void;
    reject: (reason: unknown) => void;
}

// ── Bridge 实现 ───────────────────────────────────────────────────────────────

class DbWorkerBridge {
    private worker: Worker | null = null;
    private nextId = 1;
    private pending = new Map<number, PendingEntry>();

    // SQL schema 文件内容（由调用方通过 ?raw import 读取后传入）
    private sharedSql: string = '';
    private userSql: string = '';

    // ── Worker 生命周期 ───────────────────────────────────────────────────────

    /**
     * 启动 Worker 线程（仅初始化一次）
     * @param sharedSql schema_shared.sql 的文件内容（由 database.ts ?raw import 传入）
     * @param userSql   schema_user.sql 的文件内容
     */
    start(sharedSql: string, userSql: string): void {
        if (this.worker) return;

        this.sharedSql = sharedSql;
        this.userSql   = userSql;

        // Worker 文件与 main.js 打包在同一目录（dist-electron/db.worker.js）
        // ESM 模块中无 __filename，使用 import.meta.url 替代
        const __dir = path.dirname(fileURLToPath(import.meta.url));
        const workerPath = path.join(__dir, 'db.worker.js');
        this.worker = new Worker(workerPath);

        this.worker.on('message', (msg: { id: number; result?: unknown; error?: string }) => {
            const entry = this.pending.get(msg.id);
            if (!entry) return;
            this.pending.delete(msg.id);
            if (msg.error !== undefined) {
                entry.reject(new Error(msg.error));
            } else {
                entry.resolve(msg.result);
            }
        });

        this.worker.on('error', (err) => {
            console.error('[DbWorkerBridge] Worker error:', err);
            // 拒绝所有 pending 的 Promise
            for (const [id, entry] of this.pending) {
                entry.reject(err);
                this.pending.delete(id);
            }
        });

        this.worker.on('exit', (code) => {
            if (code !== 0) {
                console.error(`[DbWorkerBridge] Worker exited with code ${code}`);
            }
            this.worker = null;
        });
    }

    // ── 私有发送 ─────────────────────────────────────────────────────────────

    private send<T>(msg: object): Promise<T> {
        if (!this.worker) {
            return Promise.reject(new Error('[DbWorkerBridge] Worker is not started. Call dbBridge.start() first.'));
        }
        const id = this.nextId++;
        return new Promise<T>((resolve, reject) => {
            this.pending.set(id, {
                resolve: resolve as (v: unknown) => void,
                reject,
            });
            this.worker!.postMessage({ id, ...msg });
        });
    }

    // ── 生命周期（数据库开关） ───────────────────────────────────────────────

    async openSharedDb(): Promise<void> {
        await this.send({
            type: 'open_shared',
            dbDir: settingManager.getStoragePath(),
            sharedSql: this.sharedSql,
        });
    }

    async openDb(userId: number): Promise<void> {
        if (!userId) throw new Error('[DbWorkerBridge] openDb requires a valid userId');
        await this.send({
            type: 'open_user',
            dbDir: settingManager.getStoragePath(),
            userId,
            userSql: this.userSql,
        });
    }

    async closePrivateDB(): Promise<void> {
        await this.send({ type: 'close_user' });
    }

    async closeAllDb(): Promise<void> {
        await this.send({ type: 'close_all' });
    }

    // ── SQL 操作 ─────────────────────────────────────────────────────────────

    /**
     * SELECT 多行，返回 T[]
     */
    query<T = unknown>(db: DbTarget, sql: string, params?: unknown[]): Promise<T[]> {
        return this.send<T[]>({ type: 'query', db, sql, params });
    }

    /**
     * SELECT 单行，返回 T | null
     */
    get<T = unknown>(db: DbTarget, sql: string, params?: unknown[]): Promise<T | null> {
        return this.send<T | null>({ type: 'get', db, sql, params });
    }

    /**
     * INSERT / UPDATE / DELETE，返回 { changes, lastInsertRowid }
     */
    execute(db: DbTarget, sql: string, params?: unknown[]): Promise<{ changes: number; lastInsertRowid: number | bigint }> {
        return this.send({ type: 'execute', db, sql, params });
    }

    /**
     * 原子事务：顺序执行多条写入操作
     */
    transaction(db: DbTarget, ops: TransactionOp[]): Promise<void> {
        return this.send({ type: 'transaction', db, ops });
    }
}

// 单例
export const dbBridge = new DbWorkerBridge();
