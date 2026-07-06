import { friendService, groupService, userService } from "@/src/services";
import { ImTypes } from '@shared/types';
import { useUserStore } from "./user";
import { useSessionStore } from "./session";
import { extractTargetIdFromSessionId } from '@/src/utils/sessionUtils';

export async function initRelationStore() {
    const userStore = useUserStore()
    const friends = await friendService.loadFriendListToStore()
    const ids = friends.map((friend: ImTypes.Friend) => friend.friend_id);
    ids.push(userStore.getUserID());

    groupService.fetchPendingApplies().then(grequests => {
        const reqGroupIds: number[] = [];
        grequests.forEach((request: ImTypes.GroupApply) => {
            reqGroupIds.push(request.group_id);
        });
        if (reqGroupIds.length) groupService.fetchByIds([...new Set(reqGroupIds)]);
    });

    friendService.loadPendingRequestsToStore().then(requests => {
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

    const conversationStore = useSessionStore()
    const groupIdsToFetch: number[] = [];

    conversationStore.sessionList.forEach((chat: ImTypes.Session) => {
        const targetId = extractTargetIdFromSessionId(chat.session_id, userStore.getUserID());
        if (chat.type === ImTypes.SessionType.SESSION_TYPE_PRIVATE) {
            if (targetId && !isNaN(targetId)) ids.push(targetId);
        } else if (chat.type === ImTypes.SessionType.SESSION_TYPE_GROUP) {
            if (targetId && !isNaN(targetId)) groupIdsToFetch.push(targetId);
        }
    })
    await userService.fetchByIds([...new Set(ids)]);

    const groupIds = await groupService.fetchUserGroupIds();
    groupIds.push(...groupIdsToFetch);
    await groupService.fetchByIds([...new Set(groupIds)]);
}

export function storeOfflineTimestamp() {
    localStorage.setItem('message_timestamp_' + useUserStore().getUserID(), Date.now().toString())
}

export function getOfflineTimestamp() {
    return Number(localStorage.getItem('message_timestamp_' + useUserStore().getUserID()))
}