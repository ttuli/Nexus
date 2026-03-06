import { friendService, groupService, userService } from "@/services";
import { ImTypes } from '@/types';
import { useUserStore } from "./user";
import { useChatStore } from "./chat";
import { extractTargetIdFromSessionId } from '@/utils/chat';

export async function initRelationStore() {
    const userStore = useUserStore()
    const friends = await friendService.loadFriendListToStore()
    const Ids = friends.map((friend: ImTypes.Friend) => friend.friend_id);
    Ids.push(userStore.getUserID());

    const requests = await friendService.loadPendingRequestsToStore()
    requests.map((request: ImTypes.FriendRequest) => {
        if (userStore.getUserID() === request.from_user_id) {
            Ids.push(request.to_user_id);
        } else {
            Ids.push(request.from_user_id);
        }
    })

    const chatStore = useChatStore()
    // const groupStore = useGroupStore()
    const groupIdsToFetch: number[] = [];

    chatStore.chatList.forEach((chat: ImTypes.Conversation) => {
        const targetId = extractTargetIdFromSessionId(chat.conversation_id, userStore.getUserID());
        if (chat.type === ImTypes.ConversationType.CONVERSATION_TYPE_PRIVATE) {
            if (targetId) Ids.push(targetId);
        } else if (chat.type === ImTypes.ConversationType.CONVERSATION_TYPE_GROUP) {
            if (targetId) groupIdsToFetch.push(targetId);
        }
    })
    await userService.fetchByIds([...new Set(Ids)]);

    const groupIds = await groupService.fetchUserGroupIds();
    groupIds.push(...groupIdsToFetch);

    const grequests = await groupService.fetchPendingApplies()
    grequests.map((request: ImTypes.GroupApply) => {
        groupIds.push(request.group_id)
    })
    await groupService.fetchByIds([...new Set(groupIds)]);
}

export function storeOfflineTimestamp() {
    localStorage.setItem('message_timestamp_' + useUserStore().getUserID(), Date.now().toString())
}

export function getOfflineTimestamp() {
    return Number(localStorage.getItem('message_timestamp_' + useUserStore().getUserID()))
}