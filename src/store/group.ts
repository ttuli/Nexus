import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { ImTypes } from '@shared/types'
import { useUserStore } from './user'

/**
 * 群组数据 Store
 * 纯状态容器，只负责存储和读取，不触发任何副作用
 * 数据获取应通过 services 层完成
 */
export const useGroupStore = defineStore('group', {
    state: () => ({
        groupMap: reactive(new Map<number, ImTypes.GroupInfo>()),
        groupMemberMap: reactive(new Map<number, ImTypes.GroupMember[]>()),
        groupRequestMap: reactive(new Map<number, ImTypes.GroupApply>()),
        // 我收到的入群邀请（被邀请人视角），key 为 invite id
        groupInviteMap: reactive(new Map<number, ImTypes.GroupInvite>()),
        joinedGroupIds: reactive(new Set<number>()),

        lastReadGroupRequestTime: 0,
    }),
    actions: {
        initLastReadTime(userId: number) {
            const savedTime = localStorage.getItem(`lastReadGroupRequestTime_${userId}`)
            if (savedTime) {
                this.lastReadGroupRequestTime = parseInt(savedTime, 10)
            }
        },
        // ==================== ImTypes.GroupInfo ====================
        setGroup(groupInfo: ImTypes.GroupInfo) {
            this.groupMap.set(groupInfo.id, groupInfo)
        },

        getGroup(id: number): ImTypes.GroupInfo | undefined {
            return this.groupMap.get(id)
        },

        // ==================== ImTypes.GroupInfo Members ====================
        setGroupMembers(groupId: number, members: ImTypes.GroupMember[]) {
            this.groupMemberMap.set(groupId, members)
        },

        getGroupMembers(groupId: number): ImTypes.GroupMember[] {
            return this.groupMemberMap.get(groupId) || []
        },

        removeGroupMember(groupId: number, userId: number) {
            const members = this.groupMemberMap.get(groupId)
            if (members) {
                this.groupMemberMap.set(groupId, members.filter(m => m.user_id !== userId))
            }
        },

        mergeGroupMembers(groupId: number, newMembers: ImTypes.GroupMember[]) {
            const currentMembers = this.groupMemberMap.get(groupId)
            if (!currentMembers) {
                this.groupMemberMap.set(groupId, newMembers)
                return
            }

            newMembers.forEach(newMember => {
                const index = currentMembers.findIndex(m => m.user_id === newMember.user_id)
                if (index !== -1) {
                    // Update existing member properties in place to preserve object reference if possible, 
                    // or replace the item to trigger reactivity on that specific item.
                    // Object.assign is good but might not handle removed properties (though uncommon for members).
                    Object.assign(currentMembers[index], newMember)
                } else {
                    currentMembers.push(newMember)
                }
            })
        },

        // ==================== ImTypes.GroupInfo Requests ====================
        updateLastReadGroupRequestTime(userId: number) {
            // 已读游标取「群申请 + 入群邀请」两个来源的最大时间，
            // 与 unreadPendingRequestCount 的统计范围保持一致，避免读后仍残留红点
            let maxTime = 0
            for (const req of this.groupRequestMap.values()) {
                const reqTime = Number(req.request_time)
                if (reqTime >= maxTime) {
                    maxTime = reqTime
                }
            }
            for (const invite of this.groupInviteMap.values()) {
                const inviteTime = Number(invite.create_time)
                if (inviteTime >= maxTime) {
                    maxTime = inviteTime
                }
            }
            this.lastReadGroupRequestTime = maxTime
            if (userId) {
                localStorage.setItem(`lastReadGroupRequestTime_${userId}`, this.lastReadGroupRequestTime.toString())
            }
        },

        setGroupRequests(requests: ImTypes.GroupApply[]) {
            requests.forEach(req => {
                this.groupRequestMap.set(req.id, req)
            })
        },

        removeGroupRequest(requestId: number) {
            this.groupRequestMap.delete(requestId)
        },

        // ==================== 群邀请（被邀请人视角）====================
        setGroupInvites(invites: ImTypes.GroupInvite[]) {
            invites.forEach(invite => {
                this.groupInviteMap.set(invite.id, invite)
            })
        },

        removeGroupInvite(inviteId: number) {
            this.groupInviteMap.delete(inviteId)
        },

        // ==================== Joined ImTypes.GroupInfo IDs ====================
        addJoinedGroup(id: number) {
            this.joinedGroupIds.add(id)
        },

        removeJoinedGroup(id: number) {
            this.joinedGroupIds.delete(id)
        },

        isJoinedGroup(id: number): boolean {
            return this.joinedGroupIds.has(id)
        }
    },
    getters: {
        // 群聊通知红点数：他人发来的群申请 + 我收到的入群邀请，
        // 仅统计晚于上次已读时间（lastReadGroupRequestTime）、需我处理的条目。
        unreadPendingRequestCount: (state) => {
            const meId = useUserStore().getUserID();
            const lastRead = state.lastReadGroupRequestTime;
            let count = 0;

            // 群申请：自己发出的待处理申请是「等待验证」，不计入需我处理的红点
            for (const req of state.groupRequestMap.values()) {
                if (req.status === ImTypes.GroupApplyStatus.GROUP_APPLY_STATUS_PENDING
                    && req.sender_id === meId
                ) continue;

                if (Number(req.request_time) > lastRead) {
                    count++;
                }
            }

            // 入群邀请：均为我收到的，仅统计待处理且晚于上次已读时间的
            for (const invite of state.groupInviteMap.values()) {
                if (invite.status !== ImTypes.InviteStatus.INVITE_STATUS_PENDING) continue;

                if (Number(invite.create_time) > lastRead) {
                    count++;
                }
            }

            return count;
        },
    }
})
