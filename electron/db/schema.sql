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
--   1. 所有消息类型共用一张表（宽表），类型特有字段允许 NULL
--   2. 通用字段用具体列存储，便于索引和查询
--   3. 扩展/类型特有字段用 JSON 列兜底，保持向前兼容
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_messages (
    -- ── 主键 ──────────────────────────────────────────────────
    -- 格式：msg:{sessionId}:{msgId}  /  cid:{sessionId}:{clientId}  /  tmp:...
    pk          TEXT        NOT NULL PRIMARY KEY,

    -- ── 基础字段（来自 ILocalMessageBase）─────────────────────
    session_id  TEXT        NOT NULL,            -- 会话 ID
    msg_id      TEXT        NOT NULL DEFAULT '', -- 服务端消息 ID（int64 → string）
    client_id   TEXT        NOT NULL DEFAULT '', -- 客户端消息 ID（乐观更新标识）
    from_user_id INTEGER    NOT NULL DEFAULT 0,  -- 发送者 UID
    send_time   INTEGER     NOT NULL,            -- 发送时间（Unix ms）
    seq         INTEGER     NOT NULL DEFAULT 0,  -- 消息序号（用于排序和去重）
    type        INTEGER     NOT NULL,            -- MessageType 枚举值
    status      INTEGER     NOT NULL DEFAULT 0,  -- MessageStatus 枚举值
    is_read     INTEGER     NOT NULL DEFAULT 0,  -- 0=未读, 1=已读

    -- ── 文本消息字段 ───────────────────────────────────────────
    content     TEXT,                            -- 文本内容（TEXT / SYSTEM 类型）
    at_list     TEXT,                            -- JSON 数组 AtInfo[]，@用户列表

    -- ── 媒体/文件通用字段 ──────────────────────────────────────
    url         TEXT,                            -- OSS 网络地址
    local_path  TEXT,                            -- 本地文件路径（下载/发送时缓存）
    thumbnail_url TEXT,                          -- 缩略图地址（图片/视频）
    file_name   TEXT,                            -- 文件名（文件类型消息）
    size        INTEGER,                         -- 文件大小（字节）
    format      TEXT,                            -- 文件格式/MIME（如 "jpg" "mp4"）

    -- ── 媒体尺寸 ───────────────────────────────────────────────
    width       INTEGER,                         -- 图片/视频宽度（px）
    height      INTEGER,                         -- 图片/视频高度（px）
    duration    INTEGER,                         -- 音视频时长（秒）

    -- ── 系统消息字段 ───────────────────────────────────────────
    op_type     INTEGER,                         -- GroupOperationType 枚举值
    group_id    INTEGER,                         -- 相关群组 ID
    target_ids  TEXT,                            -- JSON 数组 number[]，操作目标用户列表
    reason      TEXT,                            -- 操作原因（踢出/解散等）

    -- ── 扩展字段 ───────────────────────────────────────────────
    ext         TEXT,                            -- JSON，Record<string, string>
    extra       TEXT,                            -- JSON，兜底存储未来新增字段

    -- ── 本地元数据 ─────────────────────────────────────────────
    updated_at  INTEGER     NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
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

-- 客户端乐观更新：通过 client_id 反查消息行（上传完成后回填 msg_id/url）
CREATE INDEX IF NOT EXISTS idx_messages_session_clientid
    ON chat_messages (session_id, client_id)
    WHERE client_id != '';

-- 按 seq 做增量同步（拉历史消息时的游标）
CREATE INDEX IF NOT EXISTS idx_messages_session_seq
    ON chat_messages (session_id, seq)
    WHERE seq > 0;

