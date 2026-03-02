/**
 * 通用资源缓存类型定义
 */

import type { ImTypes } from '@/types';

// 资源类型枚举
export enum ResourceType {
    USER = 'user',
    GROUP = 'group',
    FRIEND = 'friend',
    FRIEND_REQUEST = 'friend_request',
    AUTH = 'auth',  // Token 相关广播
    GROUP_JOINED = 'group_joined',
    GROUP_APPLY = 'group_apply',
    GROUP_MEMBER = 'group_member',
    // MESSAGE = 'message', // 预留
}

// GroupMember 列表包装器 (一个群对应多个成员)
export interface GroupMembersWrapper {
    group_id: number;
    members: ImTypes.GroupMember[];
}

// 资源类型到数据类型的映射
export interface ResourceTypeMap {
    [ResourceType.USER]: ImTypes.UserInfo;
    [ResourceType.GROUP]: ImTypes.GroupInfo;
    [ResourceType.FRIEND]: ImTypes.Friend;
    [ResourceType.FRIEND_REQUEST]: ImTypes.FriendRequest;
    [ResourceType.GROUP_APPLY]: ImTypes.GroupApply;
    [ResourceType.GROUP_MEMBER]: GroupMembersWrapper;
    [ResourceType.GROUP_JOINED]: number;
    [ResourceType.AUTH]: any;
}

// 资源 ID 字段名映射
export const ResourceIdKeyMap: Partial<Record<ResourceType, string>> = {
    [ResourceType.USER]: 'user_id',
    [ResourceType.GROUP]: 'id',
    [ResourceType.FRIEND]: 'friend_id',
    [ResourceType.FRIEND_REQUEST]: 'id',
    [ResourceType.AUTH]: 'user_id',  // Auth 广播使用 user_id
    [ResourceType.GROUP_APPLY]: 'id',
    [ResourceType.GROUP_MEMBER]: 'group_id',
};

// 资源配置接口
export interface ResourceConfig<T> {
    idKey: keyof T;
    fetchApi: (ids: number[]) => Promise<T[]>;
    transformResponse?: (data: any) => T;
    onUpdate?: (items: T[]) => void;
}

// IPC 响应类型
export interface ResourceResponse<T = any> {
    success: boolean;
    items?: T[];
    error?: string;
}

// 主进程获取资源响应类型（包含命中和缺失信息）
export interface ResourceGetResponse<T = any> {
    success: boolean;
    items: T[];        // 缓存命中的资源
    missingIds: number[]; // 缓存未命中的 ID
    error?: string;
}

// Fetch 请求载荷
export interface FetchRequestPayload {
    requestId: string;
    type: ResourceType;
    ids: number[];
    responseChannel: string;
}

export type UserInfo = ImTypes.UserInfo;
export type Group = ImTypes.GroupInfo;
