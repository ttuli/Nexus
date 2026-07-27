/**
 * 窗口相关类型定义
 */

export enum LogoutType {
    LOGOUT = 'logout',
    KICKED = 'kicked'
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
