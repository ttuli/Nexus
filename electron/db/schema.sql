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


-- ============================================================
-- 消息主表
-- 设计原则：
--   data 列存全量 JSON（IChatMessage），读取时直接 JSON.parse 还原。
--   其余列只提炼查询/索引必需的基础字段，写入时同步更新。
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_messages (
    -- ── 主键 ──────────────────────────────────────────────────
    -- 格式：msg:{sessionId}:{msgId}  /  cid:{sessionId}:{clientId}  /  tmp:...
    pk           TEXT    NOT NULL PRIMARY KEY,

    -- ── 索引/查询字段（来自 ILocalMessageBase）────────────────
    session_id   TEXT    NOT NULL,               -- 会话 ID
    msg_id       TEXT    NOT NULL DEFAULT '',    -- 服务端消息 ID（int64 → string）
    client_id    TEXT    NOT NULL DEFAULT '',    -- 客户端消息 ID（乐观更新标识）
    from_user_id INTEGER NOT NULL DEFAULT 0,     -- 发送者 UID
    send_time    INTEGER NOT NULL,               -- 发送时间（Unix ms），用于分页排序
    seq          INTEGER NOT NULL DEFAULT 0,     -- 消息序号（增量同步游标）
    type         INTEGER NOT NULL,               -- MessageType 枚举值
    status       INTEGER NOT NULL DEFAULT 0,     -- MessageStatus 枚举值
    is_read      INTEGER NOT NULL DEFAULT 0,     -- 0=未读, 1=已读

    -- ── 全量消息数据 ──────────────────────────────────────────
    data         TEXT    NOT NULL,               -- JSON.stringify(IChatMessage)

    -- ── 本地元数据 ────────────────────────────────────────────
    updated_at   INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

-- ============================================================
-- 索引
-- ============================================================

-- 核心查询：按会话分页（send_time DESC）
CREATE INDEX IF NOT EXISTS idx_messages_session_time
    ON chat_messages (session_id, send_time);

-- 服务端消息去重：通过 msg_id 快速定位已存在的记录
CREATE INDEX IF NOT EXISTS idx_messages_session_msgid
    ON chat_messages (session_id, msg_id)
    WHERE msg_id != '';

-- 客户端乐观更新：通过 client_id 反查消息行（上传完成后回填 msg_id）
CREATE INDEX IF NOT EXISTS idx_messages_session_clientid
    ON chat_messages (session_id, client_id)
    WHERE client_id != '';
