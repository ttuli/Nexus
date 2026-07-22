import { computed, toValue, type MaybeRefOrGetter } from 'vue';
import { useUserStore } from '@/src/store/user';
import { useGroupStore } from '@/src/store/group';
import { groupService, userService } from '@/src/services';
import { ImTypes } from '@shared/types';

/**
 * 单个群的响应式派生状态 + 常用操作。
 *
 * 定位：把原先散落在 GroupDetail / GroupSessionSidebar / GroupInfoDisplay 等
 * 组件里的"同一个群"派生计算和服务编排统一到一处。
 * - 状态：全部从 store 派生（响应式），随缓存更新自动刷新；
 * - I/O：委托给 useGroupActions / groupService；
 * - 组件只保留呈现层（toast、弹窗、模板 ref）。所有操作返回结果值，
 *   由调用方决定如何提示，避免把各视图不一致的文案/弹窗耦合进来。
 *
 * @param groupIdInput 群 ID，可为 ref / getter / 原始值（内部用 toValue 解包）
 */
export function useGroup(groupIdInput: MaybeRefOrGetter<number>) {
    const userStore = useUserStore();
    const groupStore = useGroupStore();

    const groupId = computed(() => toValue(groupIdInput) || 0);
    groupService.fetchGroupMembers(groupId.value).then((res) => {
        userService.fetchByIds(res.map(member => member.user_id))
        groupStore.setGroupMembers(groupId.value, res);
    })

    // ---- 派生状态 ----
    const groupInfo = computed(() => groupStore.getGroup(groupId.value));
    /** 当前用户是否已加入该群 */
    const isMember = computed(() => groupStore.joinedGroupIds.has(groupId.value));
    const members = computed(() => groupStore.getGroupMembers(groupId.value) || []);
    const currentUserMember = computed(() =>
        members.value.find(m => m.user_id === userStore.getUserID()));

    const isOwner = computed(() => groupInfo.value?.owner_id === userStore.getUserID());
    const isOwnerOrAdmin = computed(() => {
        if (isOwner.value) return true;
        const role = currentUserMember.value?.role;
        return role === ImTypes.GroupRole.GROUP_ROLE_OWNER
            || role === ImTypes.GroupRole.GROUP_ROLE_ADMIN;
    });

    /** 我在本群的显示昵称：群昵称 > 用户名 > 兜底 '我' */
    const myNickname = computed(() => {
        const meUser = userStore.getUser(userStore.getUserID());
        return currentUserMember.value?.nickname || meUser?.user_name || '我';
    });

    const joinTypeLabel = computed(() => {
        switch (groupInfo.value?.join_type) {
            case ImTypes.JoinType.JOIN_TYPE_DIRECT: return '直接加入';
            case ImTypes.JoinType.JOIN_TYPE_AFTER_APPROVAL: return '同意后加入';
            default: return '同意后加入';
        }
    });

    // ---- 操作（返回结果值，不做 UI 提示）----

    /** 复制群号到剪贴板，返回是否成功（文案由调用方决定） */
    const copyGroupId = async (): Promise<boolean> => {
        const id = groupInfo.value?.id ?? groupId.value;
        if (!id) return false;
        try {
            await navigator.clipboard.writeText(String(id));
            return true;
        } catch {
            return false;
        }
    };

    /** 更新群信息（名称/公告/头像/加群方式），返回是否成功 */
    const updateGroup = async (patch: {
        name?: string;
        avatar?: string;
        notice?: string;
        join_type?: ImTypes.JoinType;
    }): Promise<boolean> => {
        if (!groupInfo.value) return false;
        return groupService.updateGroup({ group: groupInfo.value, ...patch });
    };

    return {
        groupId,
        groupInfo,
        isMember,
        members,
        currentUserMember,
        isOwner,
        isOwnerOrAdmin,
        myNickname,
        joinTypeLabel,
        copyGroupId,
        updateGroup,
    };
}
