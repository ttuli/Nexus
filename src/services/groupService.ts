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
import { updateGroup, setMemberNickname, joinGroup, createGroup, leaveGroup, handleGroupApply as apiHandleGroupApply, dismissGroup, getPendingInvites as apiGetPendingInvites, handleGroupInvite as apiHandleGroupInvite, inviteMembers as apiInviteMembers, removeMember as apiRemoveMember } from '@/src/apis/group'
import { ApiTypes } from '@shared/types'
import cacheService from './cacheService'
import { useGroupStore } from '../store/group';

class GroupService {
    /**
     * 批量获取群组信息（缓存到主进程）
     */
    async fetchByIds(groupIds: number[], forceUpdate: boolean = false): Promise<ImTypes.GroupInfo[]> {
        const result = await ipcService.invoke<{ items?: ImTypes.GroupInfo[] }>(IpcChannels.RESOURCE_GET, ResourceType.GROUP, groupIds, forceUpdate)
        const groupStore = useGroupStore()
        if (result.success) {
            const groups = result.data?.items || []
            groups.forEach(group => {
                groupStore.setGroup(group)
            })
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
     * 群操作通知触发的成员缓存同步：仅当主进程已有该群成员缓存时才回源刷新
     * （入群/被邀请/禁言等通知不携带完整成员数据，需全量刷新才能保证一致）
     */
    async syncGroupMembers(groupId: number): Promise<void> {
        const result = await ipcService.invoke<boolean>(IpcChannels.GROUP_SYNC_MEMBERS, groupId)
        if (!result.success) {
            console.error('[GroupService] syncGroupMembers failed:', result.error)
        }
    }

    /**
     * 从本地缓存中删除某群的指定成员（退群/被踢通知同步用）
     */
    async removeCachedMembers(groupId: number, userIds: number[]): Promise<void> {
        if (!userIds.length) return
        await cacheService.updateItems(UpdateAction.Delete, ResourceType.GROUP_MEMBER, [
            { group_id: groupId, members: userIds.map(id => ({ user_id: id })) } as any,
        ])
    }

    /**
     * 清空某群的全部本地成员缓存（群解散/自己退出或被踢后调用）
     */
    async clearCachedMembers(groupId: number): Promise<void> {
        await cacheService.updateItems(UpdateAction.Delete, ResourceType.GROUP_MEMBER, [
            { group_id: groupId, members: [] } as any,
        ])
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
    async updateGroup(data: { group: ImTypes.GroupInfo; name?: string; avatar?: string; notice?: string; join_type?: ImTypes.JoinType }): Promise<boolean> {
        try {
            await updateGroup({
                group_id: data.group.id,
                name: data.name || '',
                avatar: data.avatar || '',
                notice: data.notice !== undefined ? data.notice : data.group.notice,
                join_type: data.join_type ?? data.group.join_type,
            } as ApiTypes.group.UpdateGroupReq)
            if (data.name) {
                data.group.name = data.name
            }
            if (data.avatar) data.group.avatar = data.avatar
            if (data.notice !== undefined) data.group.notice = data.notice
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

    /**
     * 邀请用户入群（待确认制）。返回成功发送的邀请数，响应异常返回 null。
     */
    async inviteMembers(groupId: number, userIds: number[]): Promise<number | null> {
        const res = await apiInviteMembers({ group_id: groupId, member_ids: userIds })
        return res?.data?.success_count ?? null
    }

    /**
     * 批量移除群成员，返回是否成功
     */
    async removeMembers(groupId: number, userIds: number[]): Promise<boolean> {
        const res = await apiRemoveMember({
            group_id: groupId,
            user_id: 0,
            operator_id: 0, // 服务端以 JWT 身份为准，此字段仅为满足请求结构
            user_ids: userIds,
        } as ApiTypes.group.RemoveMemberReq)
        return res?.code === 200
    }

    /**
     * 获取我收到的待处理入群邀请
     */
    async fetchPendingInvites(): Promise<ImTypes.GroupInvite[]> {
        try {
            const res = await apiGetPendingInvites()
            const list = res?.data?.data ?? []
            // HTTP DTO(ApiTypes.group.GroupInvite)→ 领域类型(ImTypes.GroupInvite/social)，字段同构，
            // 仅 status 由 int32 收敛为 InviteStatus 枚举
            return list.map(iv => ({
                id: iv.id,
                group_id: iv.group_id,
                inviter_id: iv.inviter_id,
                invitee_id: iv.invitee_id,
                status: iv.status as ImTypes.InviteStatus,
                invite_msg: iv.invite_msg,
                create_time: iv.create_time,
                update_time: iv.update_time,
            }))
        } catch (e) {
            console.error('[GroupService] fetchPendingInvites failed:', e)
            return []
        }
    }

    /**
     * 处理入群邀请（接受/拒绝）。接受成功时返回入群成员信息，供上层更新本地会话/成员数。
     */
    async handleGroupInvite(inviteId: number, accept: boolean): Promise<ApiTypes.group.GroupMember | undefined> {
        const res = await apiHandleGroupInvite({ invite_id: inviteId, accept })
        return res?.data?.member
    }
}

export const groupService = new GroupService()
export default groupService
