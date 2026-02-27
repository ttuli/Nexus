import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { ImTypes } from '@/types'
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

        hasGroup(id: number): boolean {
            return this.groupMap.has(id)
        },

        deleteGroup(id: number) {
            this.groupMap.delete(id)
            this.groupMemberMap.delete(id)
            this.groupRequestMap.delete(id)
            this.joinedGroupIds.delete(id)
        },

        // ==================== ImTypes.GroupInfo Members ====================
        setGroupMembers(groupId: number, members: ImTypes.GroupMember[]) {
            this.groupMemberMap.set(groupId, members)
        },

        getGroupMembers(groupId: number): ImTypes.GroupMember[] {
            return this.groupMemberMap.get(groupId) || []
        },

        addGroupMember(groupId: number, member: ImTypes.GroupMember) {
            const members = this.groupMemberMap.get(groupId) || []
            const idx = members.findIndex(m => m.user_id === member.user_id)
            if (idx >= 0) {
                members[idx] = member
            } else {
                members.push(member)
            }
            this.groupMemberMap.set(groupId, members)
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
            let maxTime = 0
            for (const req of this.groupRequestMap.values()) {
                const reqTime = Number(req.request_time)
                if (reqTime >= maxTime) {
                    maxTime = reqTime
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

        getGroupRequest(requestId: number): ImTypes.GroupApply | undefined {
            return this.groupRequestMap.get(requestId)
        },

        removeGroupRequest(requestId: number) {
            this.groupRequestMap.delete(requestId)
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
        },

        // ==================== Clear ====================
        clearAll() {
            this.groupMap.clear()
            this.groupMemberMap.clear()
            this.groupRequestMap.clear()
            this.joinedGroupIds.clear()
            this.lastReadGroupRequestTime = 0
        }
    },
    getters: {
        // 获取未读待处理的群请求数量
        unreadPendingRequestCount: (state) => {
            let count = 0;
            for (const req of state.groupRequestMap.values()) {
                if (req.status === ImTypes.GroupApplyStatus.GROUP_APPLY_STATUS_PENDING
                    && req.sender_id === useUserStore().getUserID()
                ) continue;

                if (Number(req.request_time) > state.lastReadGroupRequestTime) {
                    count++;
                }
            }
            return count;
        },
    }
})
