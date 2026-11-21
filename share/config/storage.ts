import { CacheOptionType, ResourceType } from '@shared/types/resourceCache';

/** 本地持久化 JSON 文件名（位于 app.getPath('userData') 下） */
export const STORAGE_FILE_NAME = 'storage.json';

/** storage.json 存储键常量 */
export const StorageKeys = {
    REFRESH_TOKEN: 'refreshToken',
    LOGIN_HISTORY: 'loginHistory',                     // 登录历史记录
    MACHINE_UID: 'machineUid',
    CUSTOM_RESOURCE_PATH: 'customResourcePath',        // 用户自定义的大文件存储根目录
    DB_KEY_SHARED: 'dbKey.shared',                     // shared.db 的加密密钥（设备级，跨账号共享）
    UPDATE_SKIPPED_VERSION: 'update.skippedVersion',   // 用户选择「跳过此版本」的版本号
    UPDATE_INSTALL_RECORD: 'update.installRecord',     // 自动安装尝试记录，用于识别「装了没生效」的死循环
} as const;

/** 用户私有库 {userId}.db 的密钥存储键（每个账号一把独立密钥） */
export function dbKeyForUser(userId: number): string {
    return `dbKey.user.${userId}`;
}

/** SQLite / SQLCipher 数据库配置 */
export const DB_CONFIG = {
    /** SQLCipher 裸密钥字节长度（32 字节 = 64 位 hex） */
    keyBytes: 32,
    /** SQLite 单次 IN 子句绑定参数的安全分块上限 */
    sqliteInChunkSize: 900,
    /** 跨账号共享库文件名 */
    sharedDbFileName: 'shared.db',
} as const;

/** 内存 LRU + SQLite 资源缓存及用户/群组业务配置 */
export const CACHE_CONFIG = {
    /** 缓存过期时间（毫秒），默认 3 天 */
    expirationMs: 3 * 24 * 60 * 60 * 1000,
    /** 每类资源内存 LRU 最大条目数 */
    maxItems: 5000,
    /** 需要持久化到 SQLite 的资源类型 */
    persistTypes: [
        ResourceType.USER,
        ResourceType.GROUP,
        ResourceType.FRIEND,
        ResourceType.GROUP_JOINED,
        ResourceType.GROUP_MEMBER,
    ] as readonly ResourceType[],
    /** 本地最多保留的登录历史账号数量 */
    maxLoginHistory: 5,
    /** 按名称搜索用户/群组时的默认分页大小 */
    defaultSearchLimit: 20,
} as const;

/** 本地文件缓存与自定义协议响应配置 */
export const FILE_CACHE_CONFIG = {
    /** 本地缩略图默认最大宽度 */
    maxWidth: 280,
    /** 本地缩略图默认 JPEG 压缩质量 */
    quality: 85,
    /** localcache:// 响应缓存头 */
    httpCacheControl: 'max-age=31536000',
    /** 按 CacheOptionType 映射的默认 Content-Type */
    cacheTypeMimeMap: {
        [CacheOptionType.IMAGE_THUMB]: 'image/jpeg',
        [CacheOptionType.IMAGE]: 'image/jpeg',
        [CacheOptionType.AVATAR]: 'image/jpeg',
        [CacheOptionType.VIDEO]: 'video/mp4',
        [CacheOptionType.VIDEO_THUMB]: 'video/mp4',
        [CacheOptionType.AUDIO]: 'audio/mpeg',
    } as Partial<Record<CacheOptionType, string>>,
    /** 按文件扩展名兜底映射的 Content-Type */
    extensionMimeMap: {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.bmp': 'image/bmp',
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.ogg': 'video/ogg',
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.m4a': 'audio/mp4',
    } as Record<string, string>,
} as const;
