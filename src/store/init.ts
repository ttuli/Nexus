import { friendService, groupService, userService } from "@/services";
import { ImTypes } from '@/types';
import { useUserStore } from "./user";
// import { useGroupStore } from "./group";
import { useChatStore } from "./chat";

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
        if (chat.type === ImTypes.ConversationType.CONVERSATION_TYPE_PRIVATE) {
            Ids.push(chat.target_id)
        } else if (chat.type === ImTypes.ConversationType.CONVERSATION_TYPE_GROUP) {
            groupIdsToFetch.push(chat.target_id);
        }
    })
    let res = await userService.fetchByIds([...new Set(Ids)]);
    console.log(res)
    
    const groupIds = await groupService.fetchUserGroupIds();
    groupIds.push(...groupIdsToFetch);

    // console.log(groupIds);
    const grequests = await groupService.fetchPendingApplies()
    grequests.map((request: ImTypes.GroupApply) => {
        groupIds.push(request.group_id)
    })
    await groupService.fetchByIds([...new Set(groupIds)]);
}