/**
 * database.ts
 *
 * 数据库生命周期入口。
 * better-sqlite3 现在运行在独立的 Worker Thread（db.worker.ts）中，
 * 主进程通过 dbBridge 异步调用。
 *
 * 对外接口保持不变，但全部为 async。
 */

import { dbBridge } from './dbWorkerBridge';
// ?raw import 由 Vite 在构建时内联为字符串，Worker 无法使用此语法，所以在主进程导入后传给 Worker
import sharedSchemaSql from './schema_shared.sql?raw';
import userSchemaSql from './schema_user.sql?raw';

export { dbBridge };

/**
 * 启动 Worker 线程并初始化共享数据库。
 * 在 app.whenReady() 后调用一次。
 */
export async function openSharedDb(): Promise<void> {
    dbBridge.start(sharedSchemaSql, userSchemaSql);
    await dbBridge.openSharedDb();
}

/**
 * 登录成功后调用：打开（或切换至）用户私有数据库。
 */
export async function openDb(userId: number): Promise<void> {
    await dbBridge.openDb(userId);
}

/**
 * 退出登录时调用：关闭用户私有数据库。
 */
export async function closePrivateDB(): Promise<void> {
    await dbBridge.closePrivateDB();
}

/**
 * app 退出前调用：关闭所有数据库连接。
 */
export async function closeAllDb(): Promise<void> {
    await dbBridge.closeAllDb();
}