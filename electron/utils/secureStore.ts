import { safeStorage } from 'electron';
import { storage } from './storage';

/**
 * 敏感字符串的持久化封装
 *
 * 在 storage.json 的基础上套一层 Electron safeStorage：
 *   Windows → DPAPI（绑定当前 Windows 账户）
 *   macOS   → Keychain
 *   Linux   → libsecret / kwallet
 * 因此把 storage.json 拷到另一台机器或另一个系统账户下都解不开。
 *
 * safeStorage 在部分平台（如未安装 keyring 的 Linux）不可用。此时降级为明文存储，
 * 并在 envelope 里记录 protected=false —— 环境恢复后写入会自动升级回加密形式，
 * 不需要迁移代码。
 *
 * 注意：必须在 app.whenReady() 之后调用，否则 safeStorage 在部分平台会抛异常。
 */

/** 落盘信封格式，用 __sec 标记以便与历史明文值区分 */
interface SecureEnvelope {
    __sec: 1;
    /** protected 为 true 时是 safeStorage 密文的 base64，否则是明文原值 */
    v: string;
    protected: boolean;
}

function isEnvelope(value: unknown): value is SecureEnvelope {
    return typeof value === 'object' && value !== null && (value as SecureEnvelope).__sec === 1;
}

class SecureStore {
    /** 只在首次降级时告警一次，避免刷屏 */
    private warned = false;

    /**
     * 当前平台是否具备系统级凭据保护能力
     */
    public isProtectionAvailable(): boolean {
        try {
            return safeStorage.isEncryptionAvailable();
        } catch {
            return false;
        }
    }

    /**
     * 写入敏感值
     */
    public set(key: string, value: string): void {
        if (this.isProtectionAvailable()) {
            try {
                const cipher = safeStorage.encryptString(value).toString('base64');
                storage.set<SecureEnvelope>(key, { __sec: 1, v: cipher, protected: true });
                return;
            } catch (err) {
                console.error(`[SecureStore] encryptString failed for "${key}", falling back to plaintext:`, err);
            }
        }

        if (!this.warned) {
            this.warned = true;
            console.warn(
                '[SecureStore] safeStorage 不可用，敏感数据将以明文写入 storage.json。' +
                '若这是 Linux，安装 gnome-keyring / kwallet 后重启即可自动恢复加密。'
            );
        }
        storage.set<SecureEnvelope>(key, { __sec: 1, v: value, protected: false });
    }

    /**
     * 读取敏感值
     * @returns 解不开或不存在时返回 null
     */
    public get(key: string): string | null {
        const raw = storage.get<unknown>(key);
        if (raw === null || raw === undefined) return null;

        // 历史明文值（升级前写入的裸字符串）：原样返回，由调用方决定是否重写为密文
        if (typeof raw === 'string') return raw;

        if (!isEnvelope(raw)) {
            console.warn(`[SecureStore] Unexpected value shape for "${key}", ignoring.`);
            return null;
        }

        if (!raw.protected) return raw.v;

        try {
            return safeStorage.decryptString(Buffer.from(raw.v, 'base64'));
        } catch (err) {
            // 换了机器或系统账户后 DPAPI/Keychain 无法解密，属预期情形
            console.error(`[SecureStore] Failed to decrypt "${key}" (机器或系统账户已变更?):`, err);
            return null;
        }
    }

    /**
     * 删除敏感值
     */
    public delete(key: string): boolean {
        return storage.delete(key);
    }

    /**
     * 判断某个 key 是否存在（不解密）
     */
    public has(key: string): boolean {
        return storage.has(key);
    }
}

export const secureStore = new SecureStore();
