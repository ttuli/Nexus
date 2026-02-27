
/**
 * 监听服务
 * 处理 IPC 广播监听，更新本地 Store
 */

import { ipcService } from './ipcService'
import { useUserStore } from '@/store/user'
import { useGroupStore } from '@/store/group'
import { ResourceType, IpcChannels, UpdateAction, ImTypes } from '@/types'
import { ElMessage } from 'element-plus'
import { useChatStore } from '@/store/chat'
import { convertApplySrc2FriendSrc, convertWSMessageToIChatMessage, generateGroupSessionId, generateSessionId } from '@/utils/chat'
import windowService from './windowService'
import cacheService from './cacheService'
import router from '@/router/router'
import groupService from './groupService'

type ResourceHandler = (items: any[]) => void

class ListenerService {
    private initialized = false

    public init() {
        this.initResourceListener();
        this.initWsListener();
        this.initWindowListener();
    }

    /**
     * 初始化监听器
     */
    public initResourceListener(): void {
        if (this.initialized) return
        this.initialized = true

        const userStore = useUserStore()
        const groupStore = useGroupStore()

        // 处理器映射：ResourceType → 处理函数
        const handlerMap = new Map<ResourceType, ResourceHandler>([
            [ResourceType.USER, (items) => {
                items.forEach((item: any) => {
                    const { action, ...user } = item
                    if (action === UpdateAction.Delete) {
                        userStore.userMap.delete(user.user_id)
                    } else {
                        userStore.setUser(user as ImTypes.UserInfo)
                    }
                })
            }],

            [ResourceType.GROUP, (items) => {
                items.forEach((item: any) => {
                    const { action, ...group } = item
                    if (action === UpdateAction.Delete) {
                        groupStore.groupMap.delete(group.id)
                    } else {
                        groupStore.setGroup(group)
                    }
                })
            }],

            [ResourceType.FRIEND, (items) => {
                items.forEach((item: any) => {
                    const { action, ...friend } = item
                    if (action === UpdateAction.Delete) {
                        userStore.deleteFriend(friend.friend_id)
                    } else {
                        userStore.setFriend(friend)
                    }
                })
            }],

            [ResourceType.FRIEND_REQUEST, (items) => {
                items.forEach((item: any) => {
                    const { action, ...request } = item
                    if (action === UpdateAction.Delete) {
                        userStore.deleteFriendRequest(request.request_id)
                    } else {
                        userStore.setFriendRequest(request)
                    }
                })
            }],

            [ResourceType.AUTH, (items) => {
                items.forEach((item: any) => {
                    if (item.token) {
                        userStore.setToken(item.token)
                    }
                })
            }],

            [ResourceType.GROUP_JOINED, (items) => {
                items.forEach((item: any) => {
                    const { action, ...group } = item
                    if (action === UpdateAction.Delete) {
                        groupStore.deleteGroup(group.id)
                    } else {
                        groupStore.setGroup(group)
                        groupStore.addJoinedGroup(group.id)
                    }
                })
            }],

            [ResourceType.GROUP_APPLY, (items) => {
                items.forEach((item: any) => {
                    const { action, ...request } = item
                    if (action === UpdateAction.Delete) {
                        groupStore.removeGroupRequest(request.id)
                    } else {
                        groupStore.setGroupRequests([request])
                    }
                })
            }],

            [ResourceType.GROUP_MEMBER, (items) => {
                items.forEach((item: any) => {
                    const { action, group_id, members } = item
                    // If items are deleted, we might need a way to specify WHICH members. 
                    // But for now, let's assume Delete action on the Wrapper means clearing the list? NO.
                    // The wrapper contains a list of members. We should probably process each member individually if needed.
                    // However, standard ListenerService treats the 'item' as the unit.
                    // If action is Update/Add, we merge.
                    if (action !== UpdateAction.Delete) {
                        groupStore.mergeGroupMembers(group_id, members)
                    } else {
                        // For Delete action, if members provided, remove them?
                        // If no members, remove all?
                        // Let's implement robust handling:
                        if (members && members.length > 0) {
                            members.forEach((m: any) => groupStore.removeGroupMember(group_id, m.user_id))
                        } else {
                            // Fallback: Clear all members for this group? Or do nothing safely.
                            groupStore.setGroupMembers(group_id, [])
                        }
                    }
                })
            }],
        ])

        // 资源更新监听
        ipcService.on(IpcChannels.RESOURCE_UPDATE, (_event, data: { type: ResourceType; items: any[] }) => {
            const handler = handlerMap.get(data.type)
            if (handler) {
                handler(data.items)
            } else {
                console.warn(`[ListenerService] No handler registered for resource type: ${data.type}`)
            }
        })
    }

    private initWsListener() {
        ipcService.on(IpcChannels.WS_MESSAGE, async (_event, data: { type: ImTypes.MessageType; payload: any }) => {
            const chatStore = useChatStore()

            const chatMsg = convertWSMessageToIChatMessage(data.payload as ImTypes.WSMessage);
            if (!chatMsg) {
                console.error('[ListenerService] Failed to convert WSMessage to IChatMessage');
                return;
            }

            chatStore.addMessage(chatMsg);
            if (chatMsg.sessionId !== chatStore.currentSessionId || !await windowService.isFocused()) {
                chatStore.incrementUnread(chatMsg.sessionId);
                windowService.playNotificationSound();
            }
            switch (data.type) {
                case ImTypes.MessageType.ERROR:
                    const errorMsg = data.payload as ImTypes.ErrorMessage
                    ElMessage.error(errorMsg.error_msg || '未知错误')
                    break;
                default:
                    break;
            }
        })

        ipcService.on(IpcChannels.WS_STATE_CHANGE, (_event, _data: { state: ImTypes.ConnectionState }) => {
            // const chatStore = useChatStore()
            // chatStore.setConnectionState(data.state)
        })

        ipcService.on(IpcChannels.WS_MESSAGE_ACK, async (_event, data: { ack: ImTypes.MessageAck, timestamp: number }) => {
            const chatStore = useChatStore()

            if (data.ack.status === ImTypes.AckStatus.ACK_STATUS_FAILED) {
                chatStore.updateMessageStatus(data.ack.session_id, data.ack.client_id, ImTypes.MessageStatus.MESSAGE_STATUS_FAILED, data.timestamp)
            } else if (data.ack.status === ImTypes.AckStatus.ACK_STATUS_SUCCESS) {
                chatStore.updateMessageStatus(data.ack.session_id, data.ack.client_id, ImTypes.MessageStatus.MESSAGE_STATUS_SENT, data.timestamp)
            }
        })

        ipcService.on(IpcChannels.WS_NOTIFICATION, async (_event, data: { type: ImTypes.MessageType; payload: ImTypes.WSMessage }) => {
            const userStore = useUserStore()
            const chatStore = useChatStore()
            const groupStore = useGroupStore()
            switch (data.type) {
                case ImTypes.MessageType.FRIEND_REQUEST:
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
                        chatStore.addChat(generateSessionId(friendRequest.from_user_id, friendRequest.to_user_id))
                    }

                    if (router.currentRoute.value.name === 'ValidationMessages' && await windowService.isFocused() && userStore.currentValidationTab === 'friend') {
                        userStore.updateLastReadFriendRequestTime()
                    }
                    break;
                case ImTypes.MessageType.FRIEND_ADD:
                    const friend = ImTypes.Friend.decode(data.payload.payload)
                    await cacheService.updateItems(UpdateAction.Update, ResourceType.FRIEND, [friend])
                    chatStore.addChat(generateSessionId(friend.friend_id, friend.user_id))
                    break;
                case ImTypes.MessageType.GROUP_REQUEST:
                    const groupRequest = ImTypes.GroupApply.decode(data.payload.payload)
                    await cacheService.updateItems(UpdateAction.Update, ResourceType.GROUP_APPLY, [groupRequest])
                    if (groupRequest.status === ImTypes.GroupApplyStatus.GROUP_APPLY_STATUS_ACCEPTED) {
                        let group = await groupService.fetchByIds([groupRequest.group_id])
                        if (group.length > 0) {
                            group[0].member_count++;
                            await cacheService.updateItems(UpdateAction.Update, ResourceType.GROUP, [group[0]])
                            await cacheService.updateItems(UpdateAction.Add, ResourceType.GROUP_JOINED, [group[0]])
                        }
                    }
                    if (router.currentRoute.value.name === 'ValidationMessages' && await windowService.isFocused() && userStore.currentValidationTab === 'group') {
                        groupStore.updateLastReadGroupRequestTime(userStore.userID)
                    }
                    chatStore.addChat(generateGroupSessionId(groupRequest.group_id))
                    break;
                case ImTypes.MessageType.GROUP_CREATE:
                    const groupNotification = ImTypes.GroupNotification.decode(data.payload.payload)
                    await cacheService.updateItems(UpdateAction.Add, ResourceType.GROUP, [groupNotification.group_info])
                    await cacheService.updateItems(UpdateAction.Add, ResourceType.GROUP_JOINED, [groupNotification.group_info])
                    chatStore.addChat(generateGroupSessionId(groupNotification.group_id))
                    break;
                case ImTypes.MessageType.GROUP_JOIN:
                    const groupJoinNotification = ImTypes.GroupNotification.decode(data.payload.payload)
                    let group = await groupService.fetchByIds([groupJoinNotification.group_id])
                    if (group.length > 0) {
                        group[0].member_count++;
                        await cacheService.updateItems(UpdateAction.Update, ResourceType.GROUP, [group[0]])
                    }
                    chatStore.addChat(generateGroupSessionId(groupJoinNotification.group_id))
                    break;
                default:
                    break;
            }
        })
    }

    private initWindowListener() {
        ipcService.on(IpcChannels.WINDOW_STATE, (_event, state) => {
            const chatStore = useChatStore()
            switch (state) {
                case 'focused':
                    chatStore.clearUnread(chatStore.currentSessionId)
                    break;
                default:
                    break;
            }
        })
    }

    /**
     * 销毁监听器
     */
    public destroy(): void {
        if (!this.initialized) return
        ipcService.off(IpcChannels.RESOURCE_UPDATE)
        this.initialized = false
    }
}

export const listenerService = new ListenerService()
export default ListenerService
