/**
 * WebSocket 业务通知监听器
 * 处理 WS_NOTIFICATION IPC 频道
 * 负责处理好友请求、好友变更、群组申请、群操作通知、消息撤回等业务事件
 */

import { ipcService } from '../ipcService'
import { useUserStore } from '@/src/store/user'
import { useGroupStore } from '@/src/store/group'
import { useAppStore } from '@/src/store/app'
import { ResourceType, IpcChannels, UpdateAction, ImTypes, ValidationType, CurrentRoute } from '@/src/types'
import { useSessionStore } from '@/src/store/session'
import { useMessageStore } from '@/src/store/message'
import { generateGroupSessionId, generateSessionId } from '@/src/utils/sessionUtils';
import { convertApplySrc2FriendSrc } from '@/src/utils/messageConverter';
import windowService from '../windowService'
import cacheService from '../cacheService'
import groupService from '../groupService'
import { chatService } from '../chatService'

export function initWsNotificationListener(): void {
    ipcService.on(IpcChannels.WS_NOTIFICATION, async (_event, data: { type: ImTypes.MessageType; payload: ImTypes.WSMessage }) => {
        const userStore = useUserStore()
        const conversationStore = useSessionStore()
        const messageStore = useMessageStore()
        const groupStore = useGroupStore()
        const appStore = useAppStore()

        switch (data.type) {
            case ImTypes.MessageType.FRIEND_REQUEST: {
                const friendRequest = ImTypes.FriendRequest.decode(data.payload.payload)
                await cacheService.updateItems(UpdateAction.Update, ResourceType.FRIEND_REQUEST, [friendRequest])
                if (friendRequest.status === ImTypes.ApplyStatus.APPLY_STATUS_AGREED) {
                    await cacheService.updateItems(UpdateAction.Add, ResourceType.FRIEND, [{
                        user_id: userStore.getUserID(),
                        friend_id: friendRequest.to_user_id,
                        remark: '',
                        starred: false,
                        blocked: false,
                        source: convertApplySrc2FriendSrc(friendRequest.source),
                        create_time: friendRequest.handle_time,
                        extra: '',
                    }])
                    conversationStore.addChat(generateSessionId(friendRequest.from_user_id, friendRequest.to_user_id))
                }
                if (appStore.currentRoute === CurrentRoute.Contacts && await windowService.isFocused() && appStore.currentValidationTab === ValidationType.Friend) {
                    userStore.updateLastReadFriendRequestTime()
                }
                break
            }

            case ImTypes.MessageType.FRIEND_ADD: {
                const friend = ImTypes.Friend.decode(data.payload.payload)
                await cacheService.updateItems(UpdateAction.Update, ResourceType.FRIEND, [friend])
                conversationStore.addChat(generateSessionId(friend.friend_id, friend.user_id))
                break
            }

            case ImTypes.MessageType.FRIEND_DELETED: {
                const friend = ImTypes.Friend.decode(data.payload.payload)
                await cacheService.updateItems(UpdateAction.Delete, ResourceType.FRIEND, [friend])
                break
            }

            case ImTypes.MessageType.GROUP_REQUEST: {
                const groupRequest = ImTypes.GroupApply.decode(data.payload.payload)
                await cacheService.updateItems(UpdateAction.Update, ResourceType.GROUP_APPLY, [groupRequest])
                if (groupRequest.status === ImTypes.GroupApplyStatus.GROUP_APPLY_STATUS_ACCEPTED) {
                    const groups = await groupService.fetchByIds([groupRequest.group_id])
                    if (groups.length > 0) {
                        const updated = { ...groups[0], member_count: groups[0].member_count + 1 }
                        await cacheService.updateItems(UpdateAction.Update, ResourceType.GROUP, [updated])
                        await cacheService.updateItems(UpdateAction.Add, ResourceType.GROUP_JOINED, [updated.id])
                    }
                }
                if (appStore.currentRoute === CurrentRoute.Contacts && await windowService.isFocused() && appStore.currentValidationTab === ValidationType.Group) {
                    groupStore.updateLastReadGroupRequestTime(userStore.userID)
                }
                conversationStore.addChat(generateGroupSessionId(groupRequest.group_id))
                break
            }

            case ImTypes.MessageType.GROUP_OP_NOTIFICATION: {
                const result = await chatService.parseGroupNotification(data.payload)
                if (result.msg) {
                    conversationStore.addChat(result.sessionId)
                    messageStore.addMessage(result.msg)
                    if (result.shouldIncrementUnread) {
                        conversationStore.incrementUnread(result.sessionId)
                    }
                    if (result.shouldPlaySound) {
                        windowService.playNotificationSound()
                    }
                }
                break
            }

            case ImTypes.MessageType.MSG_OP_RECALL: {
                const msgRecall = ImTypes.MessageRecall.decode(data.payload.payload)
                messageStore.updateMessageStatus(msgRecall.conversation_id, '', ImTypes.MessageStatus.MESSAGE_STATUS_RECALLED, msgRecall.recall_time, msgRecall.msg_id)
                break
            }
        }
    })
}
