/**
 * 窗口相关类型定义
 */

export enum LogoutType {
    LOGOUT = 'logout',
    KICKED = 'kicked'
}

export interface CallWindowConfig {
    targetId: number;
    targetType: 'private' | 'group';
    fromId: number;
}
