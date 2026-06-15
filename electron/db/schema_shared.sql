-- ============================================================
-- 共享数据库 schema（shared.db）
-- 存放与登录账户无关的公共数据，所有账户共享同一份缓存
-- ============================================================

-- 用户信息表（任何账户查询到的同一 user_id 数据一致）
CREATE TABLE IF NOT EXISTS user_info (
    user_id    INTEGER PRIMARY KEY,
    user_name  TEXT    NOT NULL DEFAULT '',
    data       TEXT    NOT NULL,
    expires_at INTEGER NOT NULL
);

-- 群组信息表（群名、群主等元数据，与查看者无关）
CREATE TABLE IF NOT EXISTS group_info (
    id         INTEGER PRIMARY KEY,
    owner_id   INTEGER NOT NULL DEFAULT 0,
    name       TEXT    NOT NULL DEFAULT '',
    data       TEXT    NOT NULL,
    expires_at INTEGER NOT NULL
);

-- 群成员表（群成员列表是客观事实，与登录账户无关）
CREATE TABLE IF NOT EXISTS group_member (
    group_id   INTEGER NOT NULL,
    user_id    INTEGER NOT NULL,
    data       TEXT    NOT NULL,
    expires_at INTEGER NOT NULL,
    PRIMARY KEY (group_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_gm_group ON group_member(group_id);
