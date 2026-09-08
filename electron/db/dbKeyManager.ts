import * as crypto from 'crypto';
import { secureStore } from '@/electron/utils/secureStore';
import { StorageKeys, dbKeyForUser } from '@/electron/utils/storage';

/**
 * dbKeyManager.ts
 *
 * SQLite 数据库密钥的生成与保管。
 *
 * 密钥模型：
 *   shared.db    —— 设备级密钥，跨账号共享（存的是头像、群资料等公共缓存）
 *   {userId}.db  —— 每个账号一把独立密钥，账号之间无法互相解密
 *
 * 密钥是 32 字节随机数，不是口令派生，以 hex 交给 SQLCipher 的
 * `PRAGMA key = "x'...'"`。用裸密钥而非口令是为了跳过 SQLCipher v4 默认的
 * 256000 轮 PBKDF2 —— 否则每次开库都要跑一遍，冷启动会明显变慢。
 *
 * 密钥经 secureStore（safeStorage）保护后落在 storage.json，密钥本身
 * 不会以明文形式出现在磁盘上（safeStorage 不可用的平台除外，见 secureStore）。
 *
 * 必须在 app.whenReady() 之后使用。
 */

const KEY_BYTES = 32;

class DbKeyManager {
    /** 进程内缓存，避免每次开库都走一次 DPAPI/Keychain 解密 */
    private cache = new Map<string, string>();

    /**
     * 取出指定 storageKey 对应的密钥，不存在则生成并落盘。
     */
    private getOrCreate(storageKey: string, label: string): string {
        const cached = this.cache.get(storageKey);
        if (cached) return cached;

        const existing = secureStore.get(storageKey);
        if (existing && /^[0-9a-f]{64}$/i.test(existing)) {
            this.cache.set(storageKey, existing);
            return existing;
        }

        if (existing) {
            // 有值但形状不对（被截断/手工改过），当作丢失处理并重建
            console.error(`[DbKeyManager] ${label} 密钥格式非法，将重新生成（原数据库将无法解密，会被 worker 归档）。`);
        }

        const key = crypto.randomBytes(KEY_BYTES).toString('hex');
        secureStore.set(storageKey, key);
        this.cache.set(storageKey, key);
        console.log(`[DbKeyManager] Generated new database key for ${label}.`);
        return key;
    }

    /**
     * shared.db 的密钥（设备级）
     */
    public getSharedKey(): string {
        return this.getOrCreate(StorageKeys.DB_KEY_SHARED, 'shared.db');
    }

    /**
     * 用户私有库的密钥
     */
    public getUserKey(userId: number): string {
        if (!userId) throw new Error('[DbKeyManager] getUserKey requires a valid userId');
        return this.getOrCreate(dbKeyForUser(userId), `user ${userId}`);
    }

    /**
     * 丢弃某账号的密钥。
     *
     * 仅在确实要销毁该账号本地数据时调用 —— 密钥一删，对应的 {userId}.db
     * 就永久打不开了。注意本方法不删数据库文件本身。
     */
    public dropUserKey(userId: number): void {
        if (!userId) return;
        const storageKey = dbKeyForUser(userId);
        this.cache.delete(storageKey);
        secureStore.delete(storageKey);
        console.log(`[DbKeyManager] Dropped database key for user ${userId}.`);
    }
}

export const dbKeyManager = new DbKeyManager();
