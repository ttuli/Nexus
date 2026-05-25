/**
 * 资源更新监听器
 * 处理 RESOURCE_UPDATE IPC 广播，将远端数据同步到本地 Store
 */

import { ipcService } from '../ipcService'
import { useUserStore } from '@/store/user'
import { useGroupStore } from '@/store/group'
import { ResourceType, IpcChannels, UpdateAction, ImTypes } from '@/types'

type ResourceHandler = (items: any[]) => void

function buildHandlerMap(
    userStore: ReturnType<typeof useUserStore>,
    groupStore: ReturnType<typeof useGroupStore>
): Map<ResourceType, ResourceHandler> {
    return new Map<ResourceType, ResourceHandler>([
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
                const { action, data } = item
                if (Array.isArray(data)) {
                    data.forEach((id: number) => {
                        if (action === UpdateAction.Delete) {
                            groupStore.removeJoinedGroup(id)
                        } else {
                            groupStore.addJoinedGroup(id)
                        }
                    })
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
                if (action !== UpdateAction.Delete) {
                    groupStore.mergeGroupMembers(group_id, members)
                } else if (members && members.length > 0) {
                    members.forEach((m: any) => groupStore.removeGroupMember(group_id, m.user_id))
                } else {
                    groupStore.setGroupMembers(group_id, [])
                }
            })
        }],
    ])
}

export function initResourceListener(): void {
    const userStore = useUserStore()
    const groupStore = useGroupStore()
    const handlerMap = buildHandlerMap(userStore, groupStore)

    ipcService.on(IpcChannels.RESOURCE_UPDATE, (_event, data: { type: ResourceType; items: any[] }) => {
        const handler = handlerMap.get(data.type)
        if (handler) {
            handler(data.items)
        } else {
            console.warn(`[ResourceListener] No handler registered for resource type: ${data.type}`)
        }
    })
}
