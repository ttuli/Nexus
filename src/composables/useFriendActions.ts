import { useSessionStore } from '@/src/store/session';
import { useUserStore } from '@/src/store/user';
import { friendService, sessionService } from '@/src/services';
import { generateSessionId } from '@/src/utils/sessionUtils';
import { ApiTypes, ImTypes } from '@shared/types';
import { toRaw } from 'vue';

export function useFriendActions() {
    const sessionStore = useSessionStore();
    const userStore = useUserStore();

    /**
     * 为两个用户创建新的私聊会话
     */
    const setupNewFriendSession = (user1Id: number, user2Id: number) => {
        const sessionKey = generateSessionId(user1Id, user2Id);
        const existing = sessionStore.getSession(sessionKey);
        const updated = sessionStore.upsertSession({
            session_key: sessionKey,
            type: ImTypes.SessionType.SESSION_TYPE_PRIVATE,
            max_seq: existing?.max_seq || '0',
            update_time: existing?.update_time || Date.now(),
            last_content: existing?.last_content || '',
            last_sender: existing?.last_sender || 0,
        });
        if (updated) {
            void sessionService.saveMany([toRaw(updated)]);
        }
    };

    /**
     * 发起好友申请
     */
    const applyFriend = async (data: ApiTypes.user.NewFriendApplyReq) => {
        const res = await friendService.applyFriend(data);
        if (res.data?.friend) {
            // Friend added directly, setup session
            setupNewFriendSession(res.data.friend.user_id, res.data.friend.friend_id);
        }
        return res;
    };

    /**
     * 处理好友申请 (同意/拒绝)
     */
    const handleFriendApply = async (data: ApiTypes.user.HandleFriendApplyReq) => {
        const res = await friendService.handleFriendApply(data, userStore.userID);
        
        if (res.data?.data) {
            // Setup session if they are now friends
            if (data.result === ImTypes.ApplyStatus.APPLY_STATUS_AGREED) {
                const req = res.data.data;
                setupNewFriendSession(req.from_user_id, req.to_user_id);
            }
        }
        return res;
    };

    /**
     * 加载好友列表
     */
    const loadFriendList = async () => {
        const friends = await friendService.fetchFriendList();
        friends.forEach(friend => userStore.setFriend(friend));
        return friends;
    };

    /**
     * 加载待处理的好友请求
     */
    const loadPendingRequests = async () => {
        const requests = await friendService.fetchPendingRequests();
        requests.forEach(request => userStore.setFriendRequest(request));
        return requests;
    };

    return {
        applyFriend,
        handleFriendApply,
        loadFriendList,
        loadPendingRequests,
    };
}
