import { useGroupStore } from '@/src/store/group';
import { useSessionStore } from '@/src/store/session';
import { useMessageStore } from '@/src/store/message';
import { useUserStore } from '@/src/store/user';
import { groupService } from '@/src/services';
import { generateGroupSessionId } from '@/src/utils/sessionUtils';
import { ApiTypes, ImTypes } from '@shared/types';
import { MessageType, MessageStatus } from '@shared/types/proto';
import { IChatMessage } from '@shared/types/chatMessage';

/**
 * 封装与群组相关的复合业务逻辑
 * 协调 groupService (I/O) 和各个 Store (UI State) 之间的关系
 */
export function useGroupActions() {
    const groupStore = useGroupStore();
    const sessionStore = useSessionStore();
    const messageStore = useMessageStore();
    const userStore = useUserStore();

    /**
     * 加群或被拉入群后，在本地创建会话和系统提示消息
     */
    const setupNewGroupSession = (groupInfo: ImTypes.GroupInfo, memberIdsCount: number) => {
        const sessionKey = generateGroupSessionId(groupInfo.id);
        sessionStore.addOrPinToTop(sessionKey);

        const message: IChatMessage = {
            msgId: `local_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            sessionId: '',
            sessionKey: sessionKey,
            fromUserId: userStore.userID,
            sendTime: Date.now(),
            seq: '0',
            status: MessageStatus.MESSAGE_STATUS_UNSPECIFIED,
            isRead: true,
            type: MessageType.GROUP_OP_NOTIFICATION,
            content: `你邀请了${memberIdsCount}位用户加入了群聊`,
        };
        messageStore.upsertMessage(message);
    };

    /**
     * 创建群组
     */
    const createGroup = async (data: ApiTypes.group.CreateGroupReq) => {
        const res = await groupService.createGroup(data);
        if (res.data.data) {
            const groupInfo = res.data.data as unknown as ImTypes.GroupInfo;
            // The service already pushed to cacheService, which will trigger UI updates
            // But we need to setup the local session UI optimistically
            setupNewGroupSession(groupInfo, data.member_ids.length);
        }
        return res;
    };

    /**
     * 修改我在本群的昵称
     */
    const setMyGroupNickname = async (groupId: number, nickname: string) => {
        const currentMembers = groupStore.getGroupMembers(groupId) || [];
        const success = await groupService.setMemberNickname(groupId, nickname, userStore.userID, currentMembers);
        return success;
    };

    /**
     * 退出或解散群聊后的本地清理
     */
    const cleanupAfterLeaveGroup = (groupId: number) => {
        const sessionId = generateGroupSessionId(groupId);

        // 如果当前正在查看这个群聊，清空消息列表
        if (sessionStore.currentSessionKey === sessionId) {
            messageStore.messages = [];
        }

        // 清理缓存数据
        messageStore.invalidateMessageCache(sessionId);
        groupStore.joinedGroupIds.delete(groupId);
        groupStore.groupMap.delete(groupId);
        sessionStore.removeSession(sessionId);
    };

    /**
     * 加载单个群组基本信息并写入 Store
     */
    const loadGroupInfo = async (groupId: number, forceUpdate = false) => {
        const groups = await loadGroupInfos([groupId], forceUpdate);
        return groups[0];
    };

    /**
     * 批量加载群组基本信息并写入 Store
     */
    const loadGroupInfos = async (groupIds: number[], forceUpdate = false) => {
        const groups = await groupService.fetchByIds(groupIds, forceUpdate);
        if (groups.length > 0) {
            groups.forEach(g => groupStore.setGroup(g));
        }
        console.log(groupIds, groups, groupStore.getGroup(10000006))
        return groups;
    };

    /**
     * 加载群组成员并写入 Store
     */
    const loadGroupMembers = async (groupId: number, forceUpdate = false) => {
        const members = await groupService.fetchGroupMembers(groupId, forceUpdate);
        if (members.length > 0) {
            groupStore.setGroupMembers(groupId, members);
        }
        return members;
    };

    /**
     * 加载用户加入的所有群组 ID 并写入 Store
     */
    const loadUserGroupIds = async () => {
        const groupIds = await groupService.fetchUserGroupIds();
        groupIds.forEach((id: number) => groupStore.joinedGroupIds.add(id));
        return groupIds;
    };

    /**
     * 加载待处理的群申请并写入 Store
     */
    const loadPendingApplies = async () => {
        const applies = await groupService.fetchPendingApplies();
        applies.forEach((apply: ImTypes.GroupApply) => {
            groupStore.groupRequestMap.set(apply.id, apply);
        });
        return applies;
    };

    /**
     * 加载我收到的待处理入群邀请并写入 Store
     */
    const loadPendingInvites = async () => {
        const invites = await groupService.fetchPendingInvites();
        groupStore.setGroupInvites(invites);
        return invites;
    };

    /**
     * 处理入群邀请：accept=true 接受并在本地建立会话，false 拒绝。
     */
    const handleInvite = async (invite: ImTypes.GroupInvite, accept: boolean) => {
        const member = await groupService.handleGroupInvite(invite.id, accept);
        groupStore.removeGroupInvite(invite.id);
        if (accept) {
            // 本地乐观建立群会话与群信息（服务端同时向群内成员广播 JOIN 通知）
            groupStore.addJoinedGroup(invite.group_id);
            sessionStore.addOrPinToTop(generateGroupSessionId(invite.group_id));
            await loadGroupInfo(invite.group_id, true);
        }
        return member;
    };

    /**
     * 邀请用户入群（待确认制）。返回成功发送的邀请数，响应异常返回 null。
     */
    const inviteGroupMembers = (groupId: number, userIds: number[]) =>
        groupService.inviteMembers(groupId, userIds);

    /**
     * 批量移除群成员。API 成功后先行摘除本地成员缓存（幂等，成员列表即时刷新）；
     * 移除系统消息、人数与本地 DB 的权威同步由服务端 KICK 通知回执驱动。
     */
    const removeGroupMembers = async (groupId: number, userIds: number[]): Promise<boolean> => {
        const ok = await groupService.removeMembers(groupId, userIds);
        if (ok) {
            await groupService.removeCachedMembers(groupId, userIds);
        }
        return ok;
    };

    /**
     * 退出或解散群聊
     */
    const quitOrDismissGroup = async (groupId: number, isOwner: boolean) => {
        let res;
        if (isOwner) {
            res = await groupService.dismissGroup({ group_id: groupId } as ApiTypes.group.DismissGroupReq);
        } else {
            res = await groupService.leaveGroup({ group_id: groupId } as ApiTypes.group.LeaveGroupReq);
        }

        if (res.code === 200) {
            cleanupAfterLeaveGroup(groupId);
        }
        return res;
    };

    return {
        createGroup,
        setMyGroupNickname,
        quitOrDismissGroup,
        cleanupAfterLeaveGroup,
        loadGroupInfo,
        loadGroupInfos,
        loadGroupMembers,
        loadUserGroupIds,
        loadPendingApplies,
        loadPendingInvites,
        handleInvite,
        inviteGroupMembers,
        removeGroupMembers,
    };
}
