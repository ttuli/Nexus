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
