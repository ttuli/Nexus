/**
 * 窗口相关类型定义
 */

export enum LogoutType {
    LOGOUT = 'logout',
    KICKED = 'kicked'
}

/**
 * 托盘右键菜单的动作标识。
 * 主进程（TrayManager 分发）与渲染层（TrayMenu.vue 上报）共用，避免字符串两头各写一份。
 */
export enum TrayMenuAction {
    /** 打开/唤起主界面 */
    ShowHome = 'showHome',
    /** 打开设置窗口 */
    OpenSettings = 'openSettings',
    /** 退出登录：先由主窗口弹框确认，确认后才真正登出 */
    Logout = 'logout',
    /** 退出应用 */
    Quit = 'quit',
}

/** 托盘菜单渲染层测量出的弹层尺寸（CSS 像素，与主进程 DIP 一致） */
export interface TrayMenuSize {
    width: number;
    height: number;
}

export interface CallWindowConfig {
    /** 来电时由服务端下发；呼出时留空，由 CALL_INVITE 回执带回 */
    callId?: string;
    /** 对端用户 ID */
    peerId: number;
    sessionKey: string;
    /** call.CallMediaType：0=语音 1=视频，发起时确定、通话期间不变 */
    mediaType: number;
    /** 1=来电（显示接听按钮） 0=呼出。query 传参全是字符串，用数字避免 'false' 真值坑 */
    isIncoming: 0 | 1;
    targetType: 'private' | 'group';
}

/** 历史消息窗口参数：首次打开经 URL query 传入，窗口已打开时经 WINDOW_DATA 推送 */
export interface HistoryWindowConfig {
    sessionKey: string;
}

/** 让主窗口定位到某条消息（历史消息窗口双击时发出，经主进程转发给主窗口） */
export interface MessageJumpTarget {
    sessionKey: string;
    msgId: string;
    /** 消息的 Lamport seq：目标还没加载时，以它为锚点前后各加载一页 */
    seq: string;
}
