import { ImTypes } from '@shared/types';
import { useUserStore } from '@/src/store/user';
import { useGroupStore } from '@/src/store/group';
import { extractTargetIdFromSessionId } from '@/src/utils/sessionUtils';

/**
 * 构建带群上下文的用户名解析器：群昵称 > 好友备注 > 用户名，均未命中返回 ''
 * （群成员未缓存时自然降级到后两级；'' 由 formatSystemMessage 兜底为 "用户{id}"）
 * @param groupId 群 ID，缺省时跳过群昵称一级
 */
export function createGroupNameResolver(groupId?: number): (userId: number) => string {
    const userStore = useUserStore();
    const groupStore = useGroupStore();
    return (userId: number) => {
        if (groupId) {
            const member = groupStore.getGroupMembers(groupId).find(m => m.user_id === userId);
            if (member?.nickname) return member.nickname;
        }
        return userStore.getDisplayName(userId);
    };
}

/**
 * 获取会话展示标题：私聊取好友备注 > 用户名 > 用户{id}；群聊取群名 > 群组{id}
 */
export function getSessionTitle(session: ImTypes.Session | null | undefined): string {
    if (!session) return '';
    const userStore = useUserStore();
    const groupStore = useGroupStore();
    const targetId = extractTargetIdFromSessionId(session.session_key || '', userStore.getUserID());
    if (!targetId) return '';

    if (session.type === ImTypes.SessionType.SESSION_TYPE_PRIVATE) {
        return userStore.getDisplayName(targetId) || `用户${targetId}`;
    }
    return groupStore.getGroup(targetId)?.name || `群组${targetId}`;
}

/** 群角色排序权重：群主 (0) < 管理员 (1) < 普通成员 (2) */
export function getGroupRoleWeight(role: ImTypes.GroupRole): number {
    if (role === ImTypes.GroupRole.GROUP_ROLE_OWNER) return 0;
    if (role === ImTypes.GroupRole.GROUP_ROLE_ADMIN) return 1;
    return 2;
}

/** 按角色权重升序返回新的群成员数组（群主 > 管理员 > 普通成员） */
export function sortGroupMembersByRole(members: ImTypes.GroupMember[]): ImTypes.GroupMember[] {
    return [...members].sort((a, b) => getGroupRoleWeight(a.role) - getGroupRoleWeight(b.role));
}
