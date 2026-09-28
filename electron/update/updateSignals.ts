/**
 * 更新模块的信号中转站。
 *
 * 请求层（mainRequest / tokenManager）要上报「版本过低」，窗口配置（windowAttribute）要上报
 * 「更新窗口被关掉」，而 updateManager 反过来又依赖窗口管理、WS、请求层。直接互相 import
 * 会形成循环依赖，所以两边都只依赖这个模块：本模块除 electron.app 外不依赖任何业务模块。
 */
import { app } from 'electron';
import { ImTypes } from '@shared/types';

/** 服务端判定客户端版本过低时返回的 HTTP 状态码（426 Upgrade Required） */
export const HTTP_UPGRADE_REQUIRED = 426;

/** 上报客户端版本的请求头，Auth 服务的版本中间件据此判断 */
export const APP_VERSION_HEADER = 'X-App-Version';

export function getAppVersion(): string {
    return app.getVersion();
}

// ==================== 版本过低 ====================

/** 426 响应携带的信息 */
export interface UpgradeRequiredInfo {
    /** 服务端给出的提示文案（旧版客户端会原样展示它） */
    message: string;
    /** 服务端要求的最低版本；取不到时为空 */
    minVersion: string;
}

const DEFAULT_UPGRADE_MESSAGE = '当前版本过低，请更新后再使用';

/**
 * 解析 426 响应体。
 * 与其他错误一致走 ApiResponse 信封：protobuf 时 min_version 在 data 里（服务端把
 * xerr.Details 序列化成 JSON 放进 data），JSON 时在 details 里。解析失败只丢细节，不影响判定。
 */
export function parseUpgradeRequired(body: Buffer, contentType: string): UpgradeRequiredInfo {
    const info: UpgradeRequiredInfo = { message: DEFAULT_UPGRADE_MESSAGE, minVersion: '' };
    if (body.length === 0) return info;
    try {
        if (contentType.includes('application/x-protobuf')) {
            const resp = ImTypes.ApiResponse.decode(new Uint8Array(body));
            info.message = resp.message || info.message;
            if (resp.data?.length) {
                info.minVersion = String(JSON.parse(Buffer.from(resp.data).toString('utf-8'))?.min_version ?? '');
            }
        } else {
            const resp = JSON.parse(body.toString('utf-8'));
            info.message = resp?.message || info.message;
            info.minVersion = String(resp?.details?.min_version ?? '');
        }
    } catch (error) {
        console.warn('[UpdateSignals] 426 响应体解析失败:', error);
    }
    return info;
}

let upgradeRequired = false;
let upgradeRequiredListener: ((info: UpgradeRequiredInfo) => void) | null = null;

/**
 * 是否已进入强制更新。
 * 进入后登出链路要全部让路：身份失效提醒、kickout 都会把更新窗口拆掉，
 * 而且 token 必须留着，更新完重启才能自动登录。
 */
export function isUpgradeRequired(): boolean {
    return upgradeRequired;
}

/** 请求层收到 426 时调用。只有第一次生效，之后的重复上报直接忽略 */
export function reportUpgradeRequired(info: UpgradeRequiredInfo): void {
    if (upgradeRequired) return;
    upgradeRequired = true;
    upgradeRequiredListener?.(info);
}

export function onUpgradeRequired(listener: (info: UpgradeRequiredInfo) => void): void {
    upgradeRequiredListener = listener;
}

// ==================== 更新窗口关闭 ====================

let updateWindowClosedListener: (() => void) | null = null;

/**
 * 更新窗口被用户关掉（标题栏关闭、Alt+F4、任务栏关闭）时由窗口钩子调用。
 * closeAllWindows 会先摘掉窗口监听再关，所以程序化关闭（安装、切换强制模式）不会走到这里。
 */
export function notifyUpdateWindowClosed(): void {
    updateWindowClosedListener?.();
}

export function onUpdateWindowClosed(listener: () => void): void {
    updateWindowClosedListener = listener;
}
