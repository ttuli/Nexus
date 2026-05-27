/**
 * SQLite 缓存模块统一入口
 *
 * 独立表：
 *   userStore        → user_info 表（user_id, user_name 展开 + JSON 全量）
 *   groupStore       → group_info 表（id, owner_id, name 展开 + JSON 全量）
 *   groupMemberStore → group_member 表（group_id, user_id 复合主键）
 *
 * 通用 KV 表：
 *   kvCache          → resource_cache 表（type + id 复合主键）
 *                      用于：friend、group_joined
 *                      不缓存：friend_request、group_apply
 */

export { userStore } from './userStore';
export { groupStore } from './groupStore';
export { groupMemberStore } from './groupMemberStore';
export { kvCache } from './kvCache';
export { getDb, closeDb } from './database';
