import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { ImTypes } from '@/types'

/**
 * 群组数据 Store
 * 纯状态容器，只负责存储和读取，不触发任何副作用
 * 数据获取应通过 services 层完成
 */
export const useGroupStore = defineStore('group', {
    state: () => ({
        groupMap: reactive(new Map<number, ImTypes.GroupInfo>()),
        groupMemberMap: reactive(new Map<number, ImTypes.GroupMember[]>()),
        groupRequestMap: reactive(new Map<number, ImTypes.GroupApply[]>()),
        joinedGroupIds: reactive(new Set<number>()),
    }),
    actions: {
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
        setGroupRequests(groupId: number, requests: ImTypes.GroupApply[]) {
            this.groupRequestMap.set(groupId, requests)
        },

        getGroupRequests(groupId: number): ImTypes.GroupApply[] {
            return this.groupRequestMap.get(groupId) || []
        },

        addGroupRequest(groupId: number, request: ImTypes.GroupApply) {
            const requests = this.groupRequestMap.get(groupId) || []
            const idx = requests.findIndex(r => r.id === request.id)
            if (idx >= 0) {
                requests[idx] = request
            } else {
                requests.push(request)
            }
            this.groupRequestMap.set(groupId, requests)
        },

        removeGroupRequest(groupId: number, requestId: number) {
            const requests = this.groupRequestMap.get(groupId)
            if (requests) {
                this.groupRequestMap.set(groupId, requests.filter(r => r.id !== requestId))
            }
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
        }
    },
    getters: {
    }
})
