import { net } from 'electron';
import jwt from 'jsonwebtoken';
import { storage, StorageKeys } from '@/electron/utils/storage';
import { RefreshTokenPayload, TokenPayload, ResourceType, ImTypes, ApiTypes } from '@/src/types';
import { cacheManager } from './cacheManager';
import { APP_CONSTANTS as config } from '@/src/config/constants';

/**
 * Token 管理器
 * 负责 Token/RefreshToken 存取、本地持久化、刷新（含并发去重）
 */
class TokenManager {
    // Token 缓存
    private token: string = '';
    private refreshToken: string = '';
    private storeRefreshToken: boolean = false;
    private currentUserID: number = 0;

    // Token 刷新状态
    private isRefreshing: boolean = false;
    private pendingRefreshPromises: Array<{
        resolve: (value: any) => void;
        reject: (reason?: any) => void;
    }> = [];

    // 设备信息（由 authManager 在 init 时传入）
    private deviceId: string = '';
    private platform: string = '';

    private initialized: boolean = false;

    /**
     * 初始化 Token 管理器
     * @param deviceId 设备 ID
     * @param platform 平台标识
     */
    public init(deviceId: string, platform: string): void {
        if (this.initialized) return;
        this.initialized = true;

        this.deviceId = deviceId;
        this.platform = platform;

        // 从本地读取 refreshToken
        const savedRefreshToken = storage.get<string>(StorageKeys.REFRESH_TOKEN);
        if (savedRefreshToken) {
            const decodedToken = jwt.decode(savedRefreshToken) as RefreshTokenPayload;
            if (decodedToken.device_id !== this.deviceId) {
                this.refreshToken = '';
            } else {
                this.storeRefreshToken = true;
                this.refreshToken = savedRefreshToken;
            }
        }
    }

    // ==================== Getters ====================

    public getToken(): string {
        return this.token;
    }

    public getRefreshToken(): string {
        return this.refreshToken;
    }

    public getStoreRefreshToken(): boolean {
        return this.storeRefreshToken;
    }

    public getCurrentUserID(): number {
        return this.currentUserID;
    }

    // ==================== Setters ====================

    public setToken(token: string): void {
        this.token = token;
        const decodedToken = jwt.decode(token) as TokenPayload;
        this.currentUserID = Number(decodedToken?.user_id) || 0;
    }

    public setRefreshToken(refreshToken: string): void {
        this.refreshToken = refreshToken;
    }

    public setStoreRefreshToken(storeRefreshToken: boolean): void {
        this.storeRefreshToken = storeRefreshToken;
    }

    // ==================== Token 刷新 ====================

    /**
     * 请求刷新 Token（带去重）
     */
    public async requestTokenRefresh(): Promise<{ success: boolean; token?: string; refreshToken?: string; error?: string }> {
        // 如果正在刷新，加入等待队列
        if (this.isRefreshing) {
            return new Promise((resolve, reject) => {
                this.pendingRefreshPromises.push({ resolve, reject });
            });
        }

        this.isRefreshing = true;

        try {
            const result = await this.doRefreshToken();

            // 通知所有等待的调用方
            this.pendingRefreshPromises.forEach((p) => p.resolve(result));
            cacheManager.broadcastUpdate(ResourceType.AUTH, [result.token]);
            return { success: result.success, token: result.token };
        } catch (error) {
            const errorResult = { success: false, error: (error as Error).message };
            this.pendingRefreshPromises.forEach((p) => p.reject(error));
            return errorResult;
        } finally {
            this.isRefreshing = false;
            this.pendingRefreshPromises = [];
        }
    }

    /**
     * 使用 Electron net 模块调用刷新 Token API
     */
    private async doRefreshToken(): Promise<{ success: boolean; token?: string; refreshToken?: string; error?: string }> {
        if (!this.refreshToken) {
            return { success: false, error: 'No refresh token available' };
        }

        return new Promise((resolve) => {
            const postData = ApiTypes.auth.RefreshReq.encode({
                device_id: this.deviceId,
                platform: this.platform,
                refresh_token: '' //服务器会从Header获取，保留字段保证服务器能正确解析
            }).finish();
            const request = net.request({
                method: 'POST',
                url: `${config.authServer}/auth/refresh`,
            });

            request.setHeader('Content-Type', 'application/x-protobuf');
            request.setHeader('Accept', 'application/x-protobuf');
            request.setHeader('Authorization', `Bearer ${this.refreshToken}`);

            const chunks: Buffer[] = [];
            let contentType = '';

            request.on('response', (response) => {
                contentType = (response.headers['content-type'] as string) || '';

                response.on('data', (chunk: Buffer) => {
                    chunks.push(chunk);
                });

                response.on('end', () => {
                    try {
                        const buffer = Buffer.concat(chunks);
                        let token: string;
                        let refresh_token: string;
                        if (contentType.includes('application/x-protobuf')) {
                            const apiResp = ImTypes.ApiResponse.decode(new Uint8Array(buffer));
                            if (!apiResp.data || apiResp.code != 200) {
                                resolve({ success: false, error: apiResp.message || 'Refresh token failed' });
                                return;
                            }
                            const refreshResp = ApiTypes.auth.RefreshResp.decode(apiResp.data);
                            token = refreshResp.token;
                            refresh_token = refreshResp.refresh_token;
                        } else {
                            const result = JSON.parse(buffer.toString('utf-8'));
                            if (result.code !== 200 || !result.data) {
                                resolve({ success: false, error: result.message || 'Refresh token failed' });
                                return;
                            }
                            token = result.data.token;
                            refresh_token = result.data.refresh_token;
                        }

                        this.setToken(token);
                        this.setRefreshToken(refresh_token);
                        if (this.storeRefreshToken) {
                            storage.set(StorageKeys.REFRESH_TOKEN, refresh_token);
                        }
                        resolve({ success: true, token, refreshToken: refresh_token });
                    } catch (error) {
                        resolve({ success: false, error: 'Failed to parse response' });
                    }
                });
            });

            request.on('error', (error) => {
                console.error('[TokenManager] Token refresh request error:', error);
                resolve({ success: false, error: error.message });
            });

            request.write(Buffer.from(postData));
            request.end();
        });
    }

    public operateLocalRefreshToken(remove: boolean) {
        if (remove) {
            storage.delete(StorageKeys.REFRESH_TOKEN);
        } else {
            storage.set(StorageKeys.REFRESH_TOKEN, this.refreshToken);
        }
    }

    // ==================== 清理 ====================

    /**
     * 退出登录时清理 Token 状态
     */
    public cleanout(): void {
        storage.delete(StorageKeys.REFRESH_TOKEN);
        this.token = '';
        this.refreshToken = '';
    }
}

export const tokenManager = new TokenManager();
