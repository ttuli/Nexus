import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

/**
 * 持久化存储管理器
 * 提供增删改查功能，将数据存储到本地 JSON 文件
 */
class Storage {
    private storageDir: string;
    private storagePath: string;
    private data: Record<string, any> = {};
    private initialized: boolean = false;

    constructor() {
        // 使用 app.getPath('userData') 获取用户数据目录
        this.storageDir = app.getPath('userData');
        this.storagePath = path.join(this.storageDir, 'storage.json');
    }

    /**
     * 初始化存储，从文件加载数据
     */
    public init(): void {
        if (this.initialized) return;
        this.initialized = true;

        try {
            // 确保存储目录存在
            if (!fs.existsSync(this.storageDir)) {
                fs.mkdirSync(this.storageDir, { recursive: true });
            }

            // 如果存储文件存在，读取数据
            if (fs.existsSync(this.storagePath)) {
                const content = fs.readFileSync(this.storagePath, 'utf-8');
                this.data = JSON.parse(content);
            } else {
                this.data = {};
                console.log('[Storage] No existing storage file, starting fresh');
            }
        } catch (error) {
            console.error('[Storage] Failed to load storage:', error);
            this.data = {};
        }
    }

    /**
     * 获取数据
     * @param key 键名
     * @returns 对应的值，如果不存在返回 null
     */
    public get<T>(key: string): T | null {
        this.ensureInitialized();
        return (this.data[key] as T) ?? null;
    }

    /**
     * 设置数据
     * @param key 键名
     * @param value 值
     */
    public set<T>(key: string, value: T): void {
        this.ensureInitialized();
        this.data[key] = value;
        this.save();
    }

    /**
     * 更新数据（如果存在则更新，否则创建）
     * @param key 键名
     * @param value 值
     */
    public update<T>(key: string, value: T): void {
        this.set(key, value);
    }

    /**
     * 删除数据
     * @param key 键名
     * @returns 是否成功删除
     */
    public delete(key: string): boolean {
        this.ensureInitialized();
        if (key in this.data) {
            delete this.data[key];
            this.save();
            return true;
        }
        return false;
    }

    /**
     * 检查键是否存在
     * @param key 键名
     * @returns 是否存在
     */
    public has(key: string): boolean {
        this.ensureInitialized();
        return key in this.data;
    }

    /**
     * 获取所有键
     * @returns 所有键的数组
     */
    public keys(): string[] {
        this.ensureInitialized();
        return Object.keys(this.data);
    }

    /**
     * 清空所有数据
     */
    public clear(): void {
        this.ensureInitialized();
        this.data = {};
        this.save();
    }

    /**
     * 保存数据到文件
     */
    private save(): void {
        try {
            fs.writeFileSync(this.storagePath, JSON.stringify(this.data, null, 2), 'utf-8');
        } catch (error) {
            console.error('[Storage] Failed to save storage:', error);
        }
    }

    /**
     * 确保已初始化
     */
    private ensureInitialized(): void {
        if (!this.initialized) {
            this.init();
        }
    }
}

// 存储键常量
export const StorageKeys = {
    REFRESH_TOKEN: 'refreshToken',
    LOGIN_HISTORY: 'loginHistory',  // 登录历史记录
    MACHINE_UID: 'machineUid',
    CUSTOM_RESOURCE_PATH: 'customResourcePath', // 用户自定义的大文件存储根目录
    DB_KEY_SHARED: 'dbKey.shared',  // shared.db 的加密密钥（设备级，跨账号共享）
    UPDATE_SKIPPED_VERSION: 'update.skippedVersion', // 用户选择「跳过此版本」的版本号
    UPDATE_INSTALL_RECORD: 'update.installRecord',   // 自动安装尝试记录，用于识别「装了没生效」的死循环
} as const;

/** 用户私有库 {userId}.db 的密钥存储键（每个账号一把独立密钥） */
export function dbKeyForUser(userId: number): string {
    return `dbKey.user.${userId}`;
}

export const storage = new Storage();
export default Storage;
