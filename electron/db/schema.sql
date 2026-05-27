-- 用户信息表
CREATE TABLE IF NOT EXISTS user_info (
    user_id    INTEGER PRIMARY KEY,
    user_name  TEXT    NOT NULL DEFAULT '',
    data       TEXT    NOT NULL,
    expires_at INTEGER NOT NULL
);

-- 群组信息表
CREATE TABLE IF NOT EXISTS group_info (
    id         INTEGER PRIMARY KEY,
    owner_id   INTEGER NOT NULL DEFAULT 0,
    name       TEXT    NOT NULL DEFAULT '',
    data       TEXT    NOT NULL,
    expires_at INTEGER NOT NULL
);

-- 群成员表（复合主键，支持单成员 upsert）
CREATE TABLE IF NOT EXISTS group_member (
    group_id   INTEGER NOT NULL,
    user_id    INTEGER NOT NULL,
    data       TEXT    NOT NULL,
    expires_at INTEGER NOT NULL,
    PRIMARY KEY (group_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_gm_group ON group_member(group_id);

-- 通用 KV 缓存表（friend / group_joined）
CREATE TABLE IF NOT EXISTS resource_cache (
    type       TEXT    NOT NULL,
    id         INTEGER NOT NULL,
    data       TEXT    NOT NULL,
    expires_at INTEGER NOT NULL,
    PRIMARY KEY (type, id)
);
CREATE INDEX IF NOT EXISTS idx_resource_expires ON resource_cache(expires_at);
