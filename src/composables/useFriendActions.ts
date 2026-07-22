import { useSessionStore } from '@/src/store/session';
import { useUserStore } from '@/src/store/user';
import { friendService, sessionService, userService } from '@/src/services';
import { generateSessionId } from '@/src/utils/sessionUtils';
import { ApiTypes, ImTypes } from '@shared/types';
import { toRaw } from 'vue';
import GlobalLoading from '@/src/components/GlobalLoading';
import { ElMessage } from 'element-plus';
import CusDialog from '@/src/components/CusDialog';
import { DialogResult } from '@/src/components/CusDialog/types';

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
        try {
            GlobalLoading.show('正在提交...');
            const res = await friendService.applyFriend(data);
            if (res.data?.friend) {
                // Friend added directly, setup session
                setupNewFriendSession(res.data.friend.user_id, res.data.friend.friend_id);
                ElMessage.success("添加成功");
            } else if (res.data?.data) {
                ElMessage.success("发送好友申请成功");
            }
            return res;
        } finally {
            GlobalLoading.close();
        }
    };

    /**
     * 处理好友申请 (同意/拒绝)
     */
    const handleFriendApply = async (req: ImTypes.FriendRequest, type: 'accept' | 'reject') => {
        const status = type === 'accept' ? ImTypes.ApplyStatus.APPLY_STATUS_AGREED : ImTypes.ApplyStatus.APPLY_STATUS_REJECTED;
        const data: ApiTypes.user.HandleFriendApplyReq = {
            request_id: req.id,
            result: status,
            reject_reason: ''
        };
        try {
            GlobalLoading.show();
            const res = await friendService.handleFriendApply(data, userStore.userID);
            
            if (res.data?.data) {
                // Setup session if they are now friends
                if (data.result === ImTypes.ApplyStatus.APPLY_STATUS_AGREED) {
                    const friendReq = res.data.data;
                    setupNewFriendSession(friendReq.from_user_id, friendReq.to_user_id);
                }
            }
            
            userStore.updateLastReadFriendRequestTime();
            return res;
        } finally {
            GlobalLoading.close();
        }
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

    /**
     * 更新好友备注
     */
    const updateFriendRemark = async (friendId: number, remark: string) => {
        const friend = userStore.getFriend(friendId);
        if (!friend) return;
        try {
            GlobalLoading.show('正在提交...');
            await friendService.updateFriend({
                friend_id: friendId,
                remark: remark,
                blocked: friend.blocked,
                starred: friend.starred
            });
            userStore.setFriend({
                ...friend,
                remark: remark
            });
            ElMessage.success('备注修改成功');
        } catch (err: any) {
            ElMessage.error(err.message || '修改失败');
            throw err;
        } finally {
            GlobalLoading.close();
        }
    };

    /**
     * 设置/取消星标好友
     */
    const toggleFriendStarred = async (friendId: number, starred: boolean) => {
        const friend = userStore.getFriend(friendId);
        if (!friend) return;
        try {
            await friendService.updateFriend({
                friend_id: friendId,
                remark: friend.remark,
                blocked: friend.blocked,
                starred: starred
            });
            userStore.setFriend({
                ...friend,
                starred: starred
            });
            ElMessage.success('设置成功');
        } catch (err: any) {
            ElMessage.error(err.message || '操作失败');
            throw err;
        }
    };

    /**
     * 设置/取消黑名单
     */
    const toggleFriendBlocked = async (friendId: number, blocked: boolean) => {
        const friend = userStore.getFriend(friendId);
        if (!friend) return;
        try {
            await friendService.updateFriend({
                friend_id: friendId,
                remark: friend.remark,
                blocked: blocked,
                starred: friend.starred
            });
            userStore.setFriend({
                ...friend,
                blocked: blocked
            });
            ElMessage.success(blocked ? '已加入黑名单' : '已移出黑名单');
        } catch (err: any) {
            ElMessage.error(err.message || '操作失败');
            throw err;
        }
    };

    /**
     * 删除好友（包含确认弹窗）
     */
    const deleteFriend = async (friendId: number, options?: { friendName?: string; skipConfirm?: boolean }): Promise<boolean> => {
        const friend = userStore.getFriend(friendId);
        if (!friend) return false;

        if (!options?.skipConfirm) {
            const displayName = options?.friendName || friend.remark || friendId;
            const res = await CusDialog.open({
                title: '删除好友',
                content: `确定要删除好友「${displayName}」吗？此操作不可逆。`,
                showCancel: true,
                confirmText: '确定删除',
                cancelText: '取消',
            });
            if (res !== DialogResult.Confirm) return false;
        }

        try {
            GlobalLoading.show('正在删除...');
            await friendService.deleteFriend(friendId);
            userStore.deleteFriend(friendId);
            ElMessage.success('删除成功');
            return true;
        } catch (err: any) {
            ElMessage.error(err.message || '删除失败');
            return false;
        } finally {
            GlobalLoading.close();
        }
    };

    /**
     * 加载单个用户信息并写入 Store
     */
    const loadUserInfo = async (userId: number, forceUpdate = false) => {
        const users = await loadUserInfos([userId], forceUpdate);
        return users[0];
    };

    /**
     * 批量加载用户信息并写入 Store
     */
    const loadUserInfos = async (userIds: number[], forceUpdate = false) => {
        const users = await userService.fetchByIds(userIds, forceUpdate);
        if (users.length > 0) {
            users.forEach(u => userStore.setUser(u));
        }
        return users;
    };

    /**
     * 更新我的用户信息并同步到 Store 与本地 DB
     */
    const updateMyUserInfo = async (changes: ApiTypes.user.UpdateInfoReq) => {
        const currentUser = userStore.getUser(userStore.userID);
        if (!currentUser) return false;
        const success = await userService.updateUserInfo(changes, currentUser);
        if (success) {
            userStore.setUser({ ...currentUser, ...changes } as ImTypes.UserInfo);
        }
        return success;
    };

    return {
        applyFriend,
        handleFriendApply,
        loadFriendList,
        loadPendingRequests,
        updateFriendRemark,
        toggleFriendStarred,
        toggleFriendBlocked,
        deleteFriend,
        loadUserInfo,
        loadUserInfos,
        updateMyUserInfo,
    };
}
