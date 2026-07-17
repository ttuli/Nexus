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

    const { loadPendingApplies, loadGroupInfos, loadUserGroupIds } = useGroupActions();

    loadPendingApplies().then(grequests => {
        const reqGroupIds: number[] = [];
        grequests.forEach((request: ImTypes.GroupApply) => {
            reqGroupIds.push(request.group_id);
        });
        if (reqGroupIds.length) loadGroupInfos([...new Set(reqGroupIds)]);
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
        const targetId = extractTargetIdFromSessionId(session.session_id, userStore.getUserID());
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