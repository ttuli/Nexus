import { ImTypes } from '@/types';
/**
 * 群组服务
 * 处理群组信息的获取和管理
/**
 * 群组服务
 * 处理群组信息的获取和管理
 * 所有网络请求通过 IPC 调用主进程处理
 */

import { ipcService } from './ipcService'
import { ResourceType, IpcChannels, UpdateAction } from '@/types'
import { useGroupStore } from '@/store/group'
import { useUserStore } from '@/store/user'
import { updateGroup, setMemberNickname, joinGroup, createGroup, leaveGroup, handleGroupApply as apiHandleGroupApply } from '@/apis/group'
import { ApiTypes } from '@/types'
import cacheService from './cacheService'

class GroupService {
    /**
     * 批量获取群组信息（缓存到主进程）
     */
    async fetchByIds(groupIds: number[]): Promise<ImTypes.GroupInfo[]> {
        const result = await ipcService.invoke<{ items?: ImTypes.GroupInfo[] }>(IpcChannels.RESOURCE_GET, ResourceType.GROUP, groupIds)
        if (result.success) {
            const groups = (result.data as any)?.items ?? (result as any).items ?? []
            const groupStore = useGroupStore()
            groups.forEach((group: ImTypes.GroupInfo) => groupStore.setGroup(group))
            return groups
        }
        console.error('[GroupService] fetchByIds failed:', result.error)
        return []
    }

    /**
     * 获取用户所在群组 ID 列表（通过 IPC 调用主进程）
     */
    async fetchUserGroupIds(): Promise<number[]> {
        const result = await ipcService.invoke<number[]>(IpcChannels.GROUP_FETCH_USER_GROUPS)

        if (result.success && result.data) {

            const groupStore = useGroupStore()
            result.data.forEach((id: number) => groupStore.joinedGroupIds.add(id))
            return result.data
        }

        console.error('[GroupService] fetchUserGroupIds failed:', result.error)
        return []
    }

    /**
     * 按群名搜索群组（通过 IPC 调用主进程）
     * @param name 群组名称
     * @param limit 返回数量限制，默认 20
     * @param offset 偏移量，默认 0
     */
    async fetchByName(name: string, limit: number = 20, offset: number = 0): Promise<ImTypes.GroupInfo[]> {
        const result = await ipcService.invoke<ImTypes.GroupInfo[]>(IpcChannels.GROUP_FETCH_BY_NAME, name, limit, offset)

        if (result.success && result.data) {
            return result.data
        }

        console.error('[GroupService] fetchByName failed:', result.error)
        return []
    }

    /**
     * 获取群成员列表（通过 IPC 调用主进程）
     * @param groupId 群组 ID
     * @param limit 返回数量限制，默认 100
     * @param offset 偏移量，默认 0
     */
    async fetchGroupMembers(groupId: number): Promise<ImTypes.GroupMember[]> {
        const result = await ipcService.invoke<ImTypes.GroupMember[]>(IpcChannels.GROUP_FETCH_MEMBERS, groupId)

        if (result.success && result.data) {
            const groupStore = useGroupStore()
            groupStore.setGroupMembers(groupId, result.data)
            return result.data
        }

        console.error('[GroupService] fetchGroupMembers failed:', result.error)
        return []
    }

    /**
     * 获取待处理的群申请（通过 IPC 调用主进程） 
     */
    async fetchPendingApplies(): Promise<ImTypes.GroupApply[]> {
        const result = await ipcService.invoke<ImTypes.GroupApply[]>(IpcChannels.GROUP_FETCH_PENDING_APPLIES)

        if (result.success && result.data) {
            return result.data
        }

        console.error('[GroupService] fetchPendingApplies failed:', result.error)
        return []
    }

    /**
     * 更新群组信息
     */
    async updateGroup(data: { group: ImTypes.GroupInfo; name?: string; avatar?: string }): Promise<boolean> {
        try {
            await updateGroup({
                groupId: data.group.id,
                name: data.name || '',
                avatar: data.avatar || '',
                notice: data.group.notice // Preserving notice if it exists in group object, though not passed in data args explicitly? 
                // The args are specific: group object, and optional name/avatar to update.
                // Proto `UpdateGroupReq` has `notice`.
                // Existing code didn't update notice.
                // Keep it safe: undefined fields are optional in proto req (though my proto def has them as optional/string)
            } as any)
            if (data.name) data.group.name = data.name
            if (data.avatar) data.group.avatar = data.avatar

            await cacheService.updateItems(UpdateAction.Update, ResourceType.GROUP, [{ ...data.group }])
            return true

        } catch (e) {
            console.error('[GroupService] updateGroup failed:', e)
        }
        return false
    }

    /**
     * 设置群成员昵称
     */
    async setMemberNickname(groupId: number, nickname: string): Promise<boolean> {
        try {
            await setMemberNickname({ groupId: groupId, nickname } as any)
            const userStore = useUserStore()
            const groupStore = useGroupStore()
            let members = groupStore.getGroupMembers(groupId)
            const meId = userStore.getUserID()
            if (members) {
                const me = members.find(m => m.user_id === meId)
                if (me) {
                    me.nickname = nickname
                    cacheService.updateItems(UpdateAction.Update, ResourceType.GROUP_MEMBER, [{ group_id: groupId, members: [{ ...me }] }])
                }
            } else {
                members = await this.fetchGroupMembers(groupId)
                const me = members.find(m => m.user_id === meId)
                if (me) {
                    me.nickname = nickname
                    cacheService.updateItems(UpdateAction.Update, ResourceType.GROUP_MEMBER, [{ group_id: groupId, members: [{ ...me }] }])
                }
            }
            return true

        } catch (e) {
            console.error('[GroupService] setMemberNickname failed:', e)
        }
        return false
    }

    /**
     * 加入群组
     */
    async joinGroup(data: ApiTypes.group.JoinGroupReq) {
        return joinGroup(data)
    }

    /**
     * 创建群组
     */
    async createGroup(data: ApiTypes.group.CreateGroupReq) {
        return createGroup(data)
    }

    /**
     * 退出群组
     */
    async leaveGroup(data: ApiTypes.group.LeaveGroupReq) {
        return leaveGroup(data)
    }

    /**
     * 处理群申请
     */
    async handleGroupApply(data: ApiTypes.group.HandleGroupApplyReq) {
        return apiHandleGroupApply(data)
    }
}

export const groupService = new GroupService()
export default groupService
