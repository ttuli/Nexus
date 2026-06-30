/**
 * SQLite 缓存模块统一入口
 *
 * 双库架构：
 *   shared.db   （公共）→ userStore / groupStore / groupMemberStore
 *   {userId}.db （私有）→ kvCache / messageStore
 *
 * 启动顺序：
 *   1. app ready 后调用 openSharedDb()  —— 公共库，生命周期与 app 相同
 *   2. 登录成功后调用 openDb(userId)     —— 私有库，账号切换时自动换连接
 *   3. 退出登录时调用 closeDb()
 *   4. app 退出前调用 closeAllDb()
 */

export { userStore } from './userStore';
export { groupStore } from './groupStore';
export { groupMemberStore } from './groupMemberStore';
export { kvCache } from './kvCache';
export { messageStore } from './messageStore';
export { sessionStore } from './sessionStore';
export { openSharedDb, openDb, closePrivateDB, closeAllDb } from './database';
