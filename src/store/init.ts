import { userService } from "@/src/services";
import { useGroupActions } from '@/src/composables/useGroupActions';
import { useFriendActions } from '@/src/composables/useFriendActions';
import { ImTypes } from '@shared/types';
import { useUserStore } from "./user";
import { useSessionStore } from "./session";
import { extractTargetIdFromSessionId } from '@/src/utils/sessionUtils';

export async function initRelationStore() {
    const userStore = useUserStore()
    const { loadFriendList, loadPendingRequests } = useFriendActions();
    const friends = await loadFriendList();
    const ids = friends.map((friend: ImTypes.Friend) => friend.friend_id);
    ids.push(userStore.getUserID());

    const { loadPendingApplies, loadPendingInvites, loadGroupInfos, loadUserGroupIds } = useGroupActions();

    loadPendingApplies().then(grequests => {
        const reqGroupIds: number[] = [];
        grequests.forEach((request: ImTypes.GroupApply) => {
            reqGroupIds.push(request.group_id);
        });
        if (reqGroupIds.length) loadGroupInfos([...new Set(reqGroupIds)]);
    });

    // 加载我收到的入群邀请，预取相关群信息与邀请人信息供收件箱展示
    loadPendingInvites().then(invites => {
        const inviteGroupIds: number[] = [];
        const inviterIds: number[] = [];
        invites.forEach(invite => {
            inviteGroupIds.push(invite.group_id);
            inviterIds.push(invite.inviter_id);
        });
        if (inviteGroupIds.length) loadGroupInfos([...new Set(inviteGroupIds)]);
        if (inviterIds.length) userService.fetchByIds([...new Set(inviterIds)]);
    });

    loadPendingRequests().then(requests => {
        const reqIds: number[] = [];
        requests.forEach((request: ImTypes.FriendRequest) => {
            if (userStore.getUserID() === request.from_user_id) {
                reqIds.push(request.to_user_id);
            } else {
                reqIds.push(request.from_user_id);
            }
        });
        if (reqIds.length) userService.fetchByIds([...new Set(reqIds)]);
    });

    const sessionStore = useSessionStore()
    const groupIdsToFetch: number[] = [];

    sessionStore.sessionList.forEach((session: ImTypes.Session) => {
        // session_key 才是可解析的派生格式（群=groupId、私聊=uid_uid）；
        // session_id 是服务端分配的 ID，解析出的目标 ID 是错值。
        // 已退出/被踢的群不在 joinedGroupIds 里，其群名渲染依赖本路径预加载
        const targetId = extractTargetIdFromSessionId(session.session_key || session.session_id, userStore.getUserID());
        if (session.type === ImTypes.SessionType.SESSION_TYPE_PRIVATE) {
            if (targetId && !isNaN(targetId)) ids.push(targetId);
        } else if (session.type === ImTypes.SessionType.SESSION_TYPE_GROUP) {
            if (targetId && !isNaN(targetId)) groupIdsToFetch.push(targetId);
        }
    })
    await userService.fetchByIds([...new Set(ids)]);

    const groupIds = await loadUserGroupIds();
    const allGroupIds = [...new Set([...groupIds, ...groupIdsToFetch])];
    if (allGroupIds.length) {
        await loadGroupInfos(allGroupIds);
    }
}

export function storeOfflineTimestamp() {
    localStorage.setItem('message_timestamp_' + useUserStore().getUserID(), Date.now().toString())
}

export function getOfflineTimestamp() {
    return Number(localStorage.getItem('message_timestamp_' + useUserStore().getUserID())) || 0
}