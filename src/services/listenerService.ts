
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
import { convertWSMessageToIChatMessage } from '@/utils/chat'
import windowService from './windowService'

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
                case ImTypes.MessageType.CHAT_TEXT:
                case ImTypes.MessageType.GROUP_TEXT:
                case ImTypes.MessageType.CHAT_IMAGE:
                case ImTypes.MessageType.GROUP_IMAGE:
                case ImTypes.MessageType.CHAT_VIDEO:
                case ImTypes.MessageType.GROUP_VIDEO:
                case ImTypes.MessageType.CHAT_FILE:
                case ImTypes.MessageType.GROUP_FILE:
                case ImTypes.MessageType.FRIEND_REQUEST:
                case ImTypes.MessageType.MSG_RECALL:
                    break;
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

        ipcService.on(IpcChannels.WS_MESSAGE_ACK, async (_event, data: ImTypes.MessageAck) => {
            const chatStore = useChatStore()
            // if (data.session_id !== chatStore.currentSessionId) return;

            if (data.status === ImTypes.AckStatus.ACK_STATUS_FAILED) {
                chatStore.updateMessageStatus(data.session_id, data.client_id, ImTypes.MessageStatus.MESSAGE_STATUS_FAILED)
            } else if (data.status === ImTypes.AckStatus.ACK_STATUS_SUCCESS) {
                chatStore.updateMessageStatus(data.session_id, data.client_id, ImTypes.MessageStatus.MESSAGE_STATUS_SENT)
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
