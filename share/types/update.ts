/**
 * 应用更新相关类型（主进程 updateManager ↔ 渲染层更新提示框 / 更新窗口）
 */

/**
 * 更新模式
 * - forced：服务端判定当前版本过低（HTTP 426），不更新不能用，其他窗口已全部关闭
 * - optional：启动时发现新版本、用户在提示框里选了「立即更新」，主窗口照常可用
 */
export type UpdateMode = 'forced' | 'optional';

/**
 * 更新窗口所处阶段
 * - checking：正在向更新源查询新版本
 * - downloading：下载安装包中（附带 progress）
 * - downloaded：已下载完成，等待用户点「立即重启安装」（仅 optional）
 * - installing：即将退出并安装
 * - error：检查或下载失败，可重试
 * - install-failed：自动安装已多次未生效，需要用户手动运行安装包
 */
export type UpdatePhase =
    | 'checking'
    | 'downloading'
    | 'downloaded'
    | 'installing'
    | 'error'
    | 'install-failed';

export interface UpdateProgress {
    /** 0~100 */
    percent: number;
    /** 已下载字节数 */
    transferred: number;
    /** 总字节数 */
    total: number;
    /** 下载速度（字节/秒） */
    bytesPerSecond: number;
}

/** 更新窗口展示所需的全部状态，由主进程维护并推送 */
export interface UpdateState {
    mode: UpdateMode;
    phase: UpdatePhase;
    currentVersion: string;
    targetVersion?: string;
    /** 更新说明（已规整为纯文本，渲染层按文本展示，不走 v-html） */
    releaseNotes?: string;
    progress?: UpdateProgress;
    /** 服务端返回的强制更新说明（仅 forced） */
    serverMessage?: string;
    /** 失败原因（error / install-failed） */
    error?: string;
    /** 是否配置了官网下载页，决定是否显示「前往官网下载」 */
    hasDownloadPage: boolean;
    /** 是否有已下载的安装包可供「打开所在位置」 */
    hasInstaller: boolean;
}

/** 启动检查发现的可选更新，由主窗口 / 登录窗弹框提示 */
export interface UpdatePromptInfo {
    version: string;
    currentVersion: string;
    releaseNotes?: string;
}

/**
 * 用户对更新提示框的选择
 * - update：立即更新（打开更新窗口下载）
 * - later：稍后（本次不再提示，下次启动还会提示）
 * - skip：跳过此版本（该版本不再提示，更新的版本发布后照常提示）
 */
export type UpdatePromptAction = 'update' | 'later' | 'skip';
