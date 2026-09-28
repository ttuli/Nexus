import { net, ClientRequest } from 'electron';
import { tokenManager } from './tokenManager';
import { ImTypes, IpcChannels, LogoutType } from '@shared/types';
import { windowManager } from '@/electron/windows/windowManager';
import { APP_CONSTANTS } from '@shared/config/constants';
import {
    APP_VERSION_HEADER,
    HTTP_UPGRADE_REQUIRED,
    getAppVersion,
    parseUpgradeRequired,
    reportUpgradeRequired,
} from '@/electron/update/updateSignals';

/**
 * 主进程 HTTP 请求配置
 */
export interface MainRequestOptions {
    method: 'GET' | 'POST';
    url: string;
    data?: any;                          // POST 请求体
    headers?: Record<string, string>;    // 额外请求头
    skipAuth?: boolean;                  // 跳过自动添加 Authorization
    timeout?: number;                    // 超时时间（毫秒），默认 APP_CONSTANTS.httpTimeoutMs（与渲染进程统一）
}

/**
 * API 响应结构
 * data 字段为 Uint8Array（protobuf）或已解析的对象（JSON）
 */
export interface ApiResponse<T = any> {
    code: number;
    message: string;
    data?: T;
}

/**
 * 请求错误类
 */
export class MainRequestError extends Error {
    constructor(
        message: string,
        public readonly code?: number,
        public readonly statusCode?: number
    ) {
        super(message);
        this.name = 'MainRequestError';
    }
}

/**
 * 解码 ApiResponse 中的 protobuf data 字段
 * 类似于渲染进程 request.ts 中的 decodeResponse
 */
export function decodeMainResponse<T>(
    responseData: ApiResponse<any>,
    decodeFunc: (input: Uint8Array) => T
): ApiResponse<T> {
    if (responseData) {
        try {
            if (responseData.data instanceof Uint8Array) {
                responseData.data = decodeFunc(responseData.data);
            } else if (!responseData.data || (typeof responseData.data === 'object' && Object.keys(responseData.data).length === 0)) {
                responseData.data = decodeFunc(new Uint8Array(0));
            }
        } catch (e) {
            console.error('[MainRequest] Business data decode failed', e);
        }
    }
    return responseData as ApiResponse<T>;
}

/**
 * 执行单次 HTTP 请求
 * 支持 protobuf（Accept: application/x-protobuf）和 JSON 响应
 */
function executeRequest<T>(options: MainRequestOptions, token?: string): Promise<ApiResponse<T>> {
    return new Promise((resolve, reject) => {
        const { method, url, data, headers, timeout = APP_CONSTANTS.httpTimeoutMs } = options;

        const request: ClientRequest = net.request({
            method,
            url,
        });

        // 设置超时
        let timeoutId: NodeJS.Timeout | null = null;
        if (timeout > 0) {
            timeoutId = setTimeout(() => {
                request.abort();
                reject(new MainRequestError('请求超时', undefined, 408));
            }, timeout);
        }

        // 设置请求头
        if (data instanceof Uint8Array || data instanceof ArrayBuffer) {
            request.setHeader('Content-Type', 'application/x-protobuf');
        } else {
            request.setHeader('Content-Type', 'application/json');
        }
        request.setHeader('Accept', 'application/x-protobuf');
        // 版本号供 Auth 的版本中间件判断是否强制更新；主进程请求不经浏览器 CORS，自定义头无需网关放行
        request.setHeader(APP_VERSION_HEADER, getAppVersion());

        if (token && !options.skipAuth) {
            request.setHeader('Authorization', `Bearer ${token}`);
        }

        if (headers) {
            for (const [key, value] of Object.entries(headers)) {
                request.setHeader(key, value);
            }
        }

        const chunks: Buffer[] = [];
        let statusCode = 0;
        let contentType = '';

        request.on('response', (response) => {
            statusCode = response.statusCode;
            contentType = (response.headers['content-type'] as string) || '';

            response.on('data', (chunk: Buffer) => {
                chunks.push(chunk);
            });

            response.on('end', () => {
                if (timeoutId) clearTimeout(timeoutId);

                const buffer = Buffer.concat(chunks);

                // 版本过低：交给更新模块接管（关窗、打开更新窗口），请求本身按失败处理
                if (statusCode === HTTP_UPGRADE_REQUIRED) {
                    const info = parseUpgradeRequired(buffer, contentType);
                    reportUpgradeRequired(info);
                    reject(new MainRequestError(info.message, HTTP_UPGRADE_REQUIRED, statusCode));
                    return;
                }

                try {
                    // 空 body（如 logout 返回 200 无内容）：直接视为成功
                    if (buffer.length === 0) {
                        resolve({ code: statusCode === 200 ? 200 : statusCode, message: 'ok' });
                        return;
                    }

                    if (contentType.includes('application/x-protobuf')) {
                        // 解析外层 ApiResponse protobuf
                        const apiResp = ImTypes.ApiResponse.decode(new Uint8Array(buffer));
                        resolve({
                            code: apiResp.code,
                            message: apiResp.message,
                            data: apiResp.data as any, // Uint8Array，由调用方 decodeMainResponse 解码
                        });
                    } else {
                        // JSON 回退
                        const result: ApiResponse<T> = JSON.parse(buffer.toString('utf-8'));
                        resolve(result);
                    }
                } catch (error) {
                    reject(new MainRequestError('Failed to parse response', undefined, statusCode));
                }
            });
        });

        request.on('error', (error) => {
            if (timeoutId) clearTimeout(timeoutId);
            console.error('[MainRequest] Network error:', error);
            reject(new MainRequestError("网络错误"));
        });

        // 发送请求体（POST）
        if (method === 'POST' && data) {
            if (data instanceof Uint8Array || data instanceof ArrayBuffer) {
                const bufferPayload = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
                request.write(Buffer.from(bufferPayload));
            } else {
                request.write(JSON.stringify(data));
            }
        }

        request.end();
    });
}


/**
 * 主进程通用 HTTP 请求方法
 * 
 * 特性：
 * - 自动添加 Authorization 头
 * - 401 错误自动刷新 Token 并重试一次
 * - 支持 GET/POST 方法
 * - 支持超时设置
 * 
 * @example
 * // GET 请求
 * const response = await mainRequest<UserInfo[]>({
 *   method: 'GET',
 *   url: 'http://localhost:8021/user/info?ids=1&ids=2'
 * });
 * 
 * // POST 请求
 * const response = await mainRequest<LoginResult>({
 *   method: 'POST',
 *   url: 'http://localhost:8022/auth/login',
 *   data: { username: 'test', password: '123' },
 *   skipAuth: true
 * });
 */
export async function mainRequest<T = any>(options: MainRequestOptions): Promise<ApiResponse<T>> {
    const token = options.skipAuth ? undefined : tokenManager.getToken();

    try {
        const response = await executeRequest<T>(options, token);

        // 检查是否需要刷新 Token
        if (response.code === ImTypes.ErrorCode.ERR_UNAUTHORIZED) {
            console.log('[MainRequest] Received 401, attempting token refresh...');

            // 尝试刷新 Token
            const refreshResult = await tokenManager.requestTokenRefresh();

            if (refreshResult.success && refreshResult.token) {
                console.log('[MainRequest] Token refreshed, retrying request...');

                // 使用新 Token 重试请求
                const retryResponse = await executeRequest<T>(options, refreshResult.token);

                // 如果重试后仍然是 401，不再重试
                if (retryResponse.code === ImTypes.ErrorCode.ERR_UNAUTHORIZED) {
                    console.error('[MainRequest] Retry still returned 401');
                    windowManager.broadcastMessage(IpcChannels.LOGOUT_REMIND, { type: LogoutType.LOGOUT });
                    throw new MainRequestError('Unauthorized after token refresh', ImTypes.ErrorCode.ERR_UNAUTHORIZED);
                }

                return retryResponse;
            } else {
                console.error('[MainRequest] Token refresh failed:', refreshResult.error);
                throw new MainRequestError(
                    refreshResult.error || 'Token refresh failed',
                    refreshResult.upgradeRequired ? HTTP_UPGRADE_REQUIRED : ImTypes.ErrorCode.ERR_UNAUTHORIZED
                );
            }
        } else if (response.code === ImTypes.ErrorCode.ERR_KICKED_OUT) {
            console.error('[MainRequest] Kicked out');
            windowManager.broadcastMessage(IpcChannels.LOGOUT_REMIND, { type: LogoutType.KICKED });
            throw new MainRequestError('Kicked out', ImTypes.ErrorCode.ERR_KICKED_OUT);
        }

        return response;
    } catch (error) {
        if (error instanceof MainRequestError) {
            throw error;
        }
        throw new MainRequestError((error as Error).message);
    }
}

/**
 * GET 请求快捷方法
 */
export async function mainGet<T = any>(url: string, options?: Omit<MainRequestOptions, 'method' | 'url'>): Promise<ApiResponse<T>> {
    return mainRequest<T>({ ...options, method: 'GET', url });
}

/**
 * POST 请求快捷方法
 */
export async function mainPost<T = any>(url: string, data?: any, options?: Omit<MainRequestOptions, 'method' | 'url' | 'data'>): Promise<ApiResponse<T>> {
    return mainRequest<T>({ ...options, method: 'POST', url, data });
}
