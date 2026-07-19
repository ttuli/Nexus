import { useUserStore } from '@/src/store/user';
import { useGroupStore } from '@/src/store/group';

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
        const friend = userStore.getFriend(userId);
        if (friend?.remark) return friend.remark;
        return userStore.getUser(userId)?.user_name || '';
    };
}
