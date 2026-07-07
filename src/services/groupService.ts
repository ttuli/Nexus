import { ImTypes } from '@shared/types';
/**
 * 群组服务
 * 处理群组信息的获取和管理
/**
 * 群组服务
 * 处理群组信息的获取和管理
 * 所有网络请求通过 IPC 调用主进程处理
 */

import { ipcService } from './ipcService'
import { ResourceType, IpcChannels, UpdateAction } from '@shared/types'
import { updateGroup, setMemberNickname, joinGroup, createGroup, leaveGroup, handleGroupApply as apiHandleGroupApply, dismissGroup } from '@/src/apis/group'
import { ApiTypes } from '@shared/types'
import cacheService from './cacheService'

class GroupService {
    /**
     * 批量获取群组信息（缓存到主进程）
     */
    async fetchByIds(groupIds: number[], forceUpdate: boolean = false): Promise<ImTypes.GroupInfo[]> {
        const result = await ipcService.invoke<{ items?: ImTypes.GroupInfo[] }>(IpcChannels.RESOURCE_GET, ResourceType.GROUP, groupIds, forceUpdate)
        if (result.success) {
            return (result.data as any)?.items ?? (result as any).items ?? []
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
     */
    async fetchGroupMembers(groupId: number, forceUpdate: boolean = false): Promise<ImTypes.GroupMember[]> {
        const result = await ipcService.invoke<ImTypes.GroupMember[]>(IpcChannels.GROUP_FETCH_MEMBERS, groupId, forceUpdate)

        if (result.success && result.data) {
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
    async updateGroup(data: { group: ImTypes.GroupInfo; name?: string; avatar?: string; join_type?: ImTypes.JoinType }): Promise<boolean> {
        try {
            await updateGroup({
                group_id: data.group.id,
                name: data.name || '',
                avatar: data.avatar || '',
                notice: data.group.notice,
                join_type: data.join_type ?? data.group.join_type,
            } as ApiTypes.group.UpdateGroupReq)
            if (data.name) {
                data.group.name = data.name
            }
            if (data.avatar) data.group.avatar = data.avatar
            if (data.join_type !== undefined) data.group.join_type = data.join_type

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
    async setMemberNickname(groupId: number, nickname: string, meId: number, currentMembers: ImTypes.GroupMember[]): Promise<boolean> {
        try {
            await setMemberNickname({ group_id: groupId, nickname } as ApiTypes.group.SetMemberNicknameReq)
            
            const me = currentMembers.find(m => m.user_id === meId)
            if (me) {
                me.nickname = nickname
                cacheService.updateItems(UpdateAction.Update, ResourceType.GROUP_MEMBER, [{ group_id: groupId, members: [{ ...me }] }])
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
        let res = await joinGroup(data)
        if (res.data.data) {
            await cacheService.updateItems(UpdateAction.Add, ResourceType.GROUP_APPLY, [res.data.data as unknown as ImTypes.GroupApply]);
        }
    }

    /**
     * 创建群组
     */
    async createGroup(data: ApiTypes.group.CreateGroupReq) {
        let res = await createGroup(data)
        if (res.data.data) {
            const groupInfo = res.data.data as unknown as ImTypes.GroupInfo
            await cacheService.updateItems(UpdateAction.Add, ResourceType.GROUP, [groupInfo])
            await cacheService.updateItems(UpdateAction.Add, ResourceType.GROUP_JOINED, [groupInfo.id])
        }
        return res
    }

    /**
     * 退出群组
     */
    async leaveGroup(data: ApiTypes.group.LeaveGroupReq) {
        return leaveGroup(data)
    }

    /**
     * 解散群组
     */
    async dismissGroup(data: ApiTypes.group.DismissGroupReq) {
        return dismissGroup(data)
    }

    /**
     * 处理群申请
     */
    async handleGroupApply(data: ApiTypes.group.HandleGroupApplyReq) {
        try {
            let res = await apiHandleGroupApply(data)
            if (res.data.data) {
                await cacheService.updateItems(UpdateAction.Update, ResourceType.GROUP_APPLY, [res.data.data])
                if (res.data.data.status == ImTypes.GroupApplyStatus.GROUP_APPLY_STATUS_ACCEPTED) {
                    let group = await groupService.fetchByIds([res.data.data.group_id])
                    if (group.length > 0) {
                        group[0].member_count++;
                        await cacheService.updateItems(UpdateAction.Update, ResourceType.GROUP, [group[0]])
                    }
                }
            }
        } catch (e) {
            console.error('[GroupService] handleGroupApply failed:', e)
        }
    }
}

export const groupService = new GroupService()
export default groupService
