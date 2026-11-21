import type { UpdatePromptAction } from '@shared/types/update';

/** 应用更新与版本校验相关配置 */
export const UPDATE_CONFIG = {
    /** 服务端判定客户端版本过低时返回的 HTTP 状态码（426 Upgrade Required） */
    httpUpgradeRequired: 426,
    /** 上报客户端版本的请求头，Auth 服务的版本中间件据此判断 */
    appVersionHeader: 'X-App-Version',
    /** 426 响应体未提供文案时的兜底提示 */
    defaultUpgradeMessage: '当前版本过低，请更新后再使用',
    /** 启动探测超时（毫秒）。排在登录窗之前，不能拖慢启动太久；超时按探测失败处理，交给登录时兜底 */
    probeTimeoutMs: 2500,
    /** 强制更新下载完后停留片刻再重启（毫秒），让用户看清「即将重启安装」 */
    installDelayMs: 1500,
    /**
     * 同一版本自动安装的次数上限，强制更新的自动安装和退出时的静默安装都计入。
     * 避免被安全软件拦截或文件占用时陷入反复静默重装死循环。
     */
    maxAutoInstallAttempts: 2,
    /** 退出时最多等后台无感下载的时间上限（毫秒）：网络太慢就不等了，直接退出，下次启动重新下载 */
    quitDownloadWaitMs: 10 * 60 * 1000,
    /** 可选更新提示框允许的响应动作白名单（IPC 校验用） */
    promptActions: ['update', 'later', 'skip'] as readonly UpdatePromptAction[],
} as const;
