import * as os from 'os';
import { storage, StorageKeys } from '../utils/storage';
import { ApiTypes } from '../../src/types';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { tokenManager } from './tokenManager';
import { mainPost, decodeMainResponse } from './mainRequest';

/**
 * 认证管理器
 * 负责登录、退出登录、设备信息管理
 * Token 的存取和刷新由 tokenManager 负责
 */
class AuthManager {
    // 设备信息
    private deviceId: string = '';
    private platform: string = '';

    private initialized: boolean = false;

    public init(): void {
        if (this.initialized) return;
        this.initialized = true;

        // 初始化存储
        storage.init();
        // 初始化设备信息
        this.initDeviceInfo();

        // 初始化 Token 管理器
        tokenManager.init(this.deviceId, this.platform);
    }

    /**
     * 初始化设备信息
     */
    private initDeviceInfo(): void {
        const machineUid = storage.get<string>(StorageKeys.MACHINE_UID);
        if (machineUid) {
            this.deviceId = machineUid;
        } else {
            this.deviceId = uuidv4()
            storage.set(StorageKeys.MACHINE_UID, this.deviceId);
        }
        this.platform = os.platform();
    }

    // ==================== Getters ====================

    public getDeviceInfo(): { deviceId: string; platform: string } {
        return { deviceId: this.deviceId, platform: this.platform };
    }

    // ==================== 登录 ====================

    /**
     * 执行登录请求
     * @returns { success, userId?, error? }
     */
    public async doLogin(
        account: string,
        password: string,
        remember: boolean = false
    ): Promise<{ success: boolean; userId?: number; error?: string }> {
        try {
            const res = await mainPost<ApiTypes.auth.LoginResp>(`${config.authServer}/auth/login`, {
                account: Number(account),
                password,
                device_id: this.deviceId,
                platform: this.platform,
            }, { skipAuth: true });

            if (res.code === 200) {
                const decoded = decodeMainResponse(res, ApiTypes.auth.LoginResp.decode);
                if (decoded.data) {
                    tokenManager.setToken(decoded.data.token);
                    tokenManager.setRefreshToken(decoded.data.refresh_token);
                    tokenManager.setStoreRefreshToken(remember);
                    return { success: true, userId: tokenManager.getCurrentUserID() };
                }
            }

            return { success: false, error: res.message || 'Login failed' };
        } catch (error: any) {
            console.error('[AuthManager] Login request error:', error);
            return { success: false, error: error.message || 'Login failed' };
        }
    }

    /**
     * 调用退出登录 API
     */
    public async callLogoutApi(): Promise<void> {
        if (!tokenManager.getToken()) return;

        try {
            await mainPost(`${config.authServer}/auth/logout`, {
                remove_rt: !tokenManager.getStoreRefreshToken(),
                device_id: this.deviceId,
            } as ApiTypes.auth.LogoutReq);
        } catch (error) {
            console.error('[AuthManager] Logout request error:', error);
        }
    }
}

export const authManager = new AuthManager();
