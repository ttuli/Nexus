/**
 * WebSocket 业务通知监听器
 * 处理 WS_NOTIFICATION IPC 频道
 * 负责处理好友请求、好友变更、群组申请、群操作通知、消息撤回等业务事件
 */

import { ipcService } from '../ipcService'
import { useUserStore } from '@/src/store/user'
import { useGroupStore } from '@/src/store/group'
import { ResourceType, IpcChannels, UpdateAction, ImTypes, ValidationType } from '@shared/types'
import { currentValidationTab } from '@/src/composables/useValidationTab'
import { useRouter } from 'vue-router'
import { useSessionStore } from '@/src/store/session'
import { useMessageStore } from '@/src/store/message'
import { toRaw } from 'vue'
import { generateGroupSessionId, generateSessionId } from '@/src/utils/sessionUtils';
import { convertApplySrc2FriendSrc } from '@/src/utils/messageConverter';
import windowService from '../windowService'
import cacheService from '../cacheService'
import groupService from '../groupService'
import { chatService } from '../chatService'

export function initWsNotificationListener(): void {
    ipcService.on(IpcChannels.WS_NOTIFICATION, async (_event, data: { type: ImTypes.MessageType; payload: ImTypes.WSMessage }) => {
        const userStore = useUserStore()
        const sessionStore = useSessionStore()
        const messageStore = useMessageStore()
        const groupStore = useGroupStore()
        const router = useRouter()

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
                    sessionStore.addOrPinToTop(generateSessionId(friendRequest.from_user_id, friendRequest.to_user_id))
                }
                if (router.currentRoute.value.path.includes('contacts') && await windowService.isFocused() && currentValidationTab.value === ValidationType.Friend) {
                    userStore.updateLastReadFriendRequestTime()
                }
                break
            }

            case ImTypes.MessageType.FRIEND_ADD: {
                const friend = ImTypes.Friend.decode(data.payload.payload)
                await cacheService.updateItems(UpdateAction.Update, ResourceType.FRIEND, [friend])
                sessionStore.addOrPinToTop(generateSessionId(friend.friend_id, friend.user_id))
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
                if (router.currentRoute.value.path.includes('contacts') && await windowService.isFocused() && currentValidationTab.value === ValidationType.Group) {
                    groupStore.updateLastReadGroupRequestTime(userStore.userID)
                }
                sessionStore.addOrPinToTop(generateGroupSessionId(groupRequest.group_id))
                break
            }

            // 统一通知消息：群操作、消息撤回等控制类事件的统一载体。
            // 载荷为 NotifyMessage 信封（base + oneof body），落库分配的
            // msg_id / session_id / seq 在 WSMessage 顶层回填。
            case ImTypes.MessageType.NOTIFICATION: {
                const notify = ImTypes.NotifyMessage.decode(data.payload.payload)
                const envelope = {
                    msgId: data.payload.msg_id,
                    sessionId: data.payload.session_id || notify.base?.session_id,
                    seq: data.payload.msg_seq,
                }

                if (notify.group_notify) {
                    const result = await chatService.parseGroupNotification(notify.group_notify, envelope)
                    if (result.msg) {
                        sessionStore.addOrPinToTop(result.sessionKey || '')
                        messageStore.upsertMessage(result.msg)
                        if (result.shouldIncrementUnread) {
                            sessionStore.incrementUnread(result.sessionKey || '')
                        }
                        if (result.shouldPlaySound) {
                            windowService.playNotificationSound()
                        }
                        // 持久化通知消息到本地 SQLite
                        void ipcService.invoke(IpcChannels.MSG_SAVE, JSON.parse(JSON.stringify(toRaw(result.msg))));
                    }
                } else if (notify.recall) {
                    // 撤回者 / 会话由信封 base 承载；msg_id 指被撤回的消息
                    const sessionId = envelope.sessionId || ''
                    const updatedMsg = messageStore.updateMessageStatus(sessionId, '', ImTypes.MessageStatus.MESSAGE_STATUS_RECALLED, notify.recall.recall_time, notify.recall.msg_id)
                    if (updatedMsg) {
                        // 同步更新本地 SQLite 的消息撤回状态
                        void ipcService.invoke(IpcChannels.MSG_SAVE, JSON.parse(JSON.stringify(toRaw(updatedMsg))));
                    }
                }
                break
            }
        }
    })
}
