-- ============================================================
-- 用户私有数据库 schema（{userId}.db）
-- 存放与登录账户强绑定的私有数据，不同账户完全隔离
-- ============================================================

-- 通用 KV 缓存表（存储账户私有数据：好友列表、已加入的群列表等）
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
    -- 格式：msg:{sessionId}:{msgId}  /  cid:{sessionId}:{clientId}  /  tmp:...\
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


-- ============================================================
-- 会话表（存储会话列表）
-- ============================================================
CREATE TABLE IF NOT EXISTS sessions (
    session_id        TEXT,
    type              INTEGER NOT NULL,
    session_key       TEXT PRIMARY KEY,
    max_seq           INTEGER NOT NULL DEFAULT 0,
    last_sender       INTEGER NOT NULL DEFAULT 0,
    last_content      TEXT NOT NULL DEFAULT '',
    last_message_time INTEGER NOT NULL DEFAULT 0,
    unread_count      INTEGER NOT NULL DEFAULT 0,
    is_top            INTEGER NOT NULL DEFAULT 1,
    is_disturb        INTEGER NOT NULL DEFAULT 1,
    create_time       INTEGER NOT NULL DEFAULT 0,
    update_time       INTEGER NOT NULL DEFAULT 0,
    is_in_list        INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sessions_sessionid 
    ON sessions(session_id) 
    WHERE session_id != '';
