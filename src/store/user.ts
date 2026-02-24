import { ImTypes } from '@/types';
import { defineStore } from 'pinia'
import { jwtDecode } from "jwt-decode";
import { TokenPayload } from '@/types'
import { reactive } from 'vue'
import { userService } from '@/services';

export const useUserStore = defineStore('user', {
  state: () => ({
    token: '',
    userID: 0,

    userMap: reactive(new Map<number, ImTypes.UserInfo>()),
    friendMap: reactive(new Map<number, ImTypes.Friend>()),
    friendRequestMap: reactive(new Map<number, ImTypes.FriendRequest>()),
    // 辅助 Set，用于 O(1) 查找用户是否有好友请求
    friendRequestUserIds: reactive(new Set<number>()),

    lastReadFriendRequestId: 0,
  }),
  actions: {
    // ==================== Auth ====================
    setToken(token: string) {
      this.token = token
      if (token === '') return
      const payload = jwtDecode<TokenPayload>(token)
      this.userID = Number(payload.user_id)

      // Load last read id from localStorage
      const savedId = localStorage.getItem(`lastReadFriendRequestId_${this.userID}`)
      if (savedId) {
        this.lastReadFriendRequestId = parseInt(savedId, 10)
      }
    },
    getToken() {
      return this.token
    },
    getUserID() {
      return this.userID
    },

    // ==================== User ====================
    setUser(userInfo: ImTypes.UserInfo) {
      this.userMap.set(userInfo.user_id, userInfo)
    },

    getUser(id: number): ImTypes.UserInfo | undefined {
      if (!this.userMap.has(id)) {
        userService.fetchByIds([id])
      }
      return this.userMap.get(id)
    },

    hasUser(id: number): boolean {
      return this.userMap.has(id)
    },

    // ==================== Friend ====================
    setFriend(friendInfo: ImTypes.Friend) {
      this.friendMap.set(friendInfo.friend_id, friendInfo)
    },

    getFriend(id: number): ImTypes.Friend | undefined {
      return this.friendMap.get(id)
    },

    hasFriend(id: number): boolean {
      return this.friendMap.has(id)
    },

    deleteFriend(friendId: number) {
      this.friendMap.delete(friendId)
    },

    isFriend(id: number): boolean {
      return this.friendMap.has(id)
    },

    // ==================== Friend Request ====================
    updateLastReadFriendRequestId() {
      let maxId = 0
      for (const req of this.friendRequestMap.values()) {
        if (req.id > maxId) {
          maxId = req.id
        }
      }
      this.lastReadFriendRequestId = maxId
      if (this.userID) {
        localStorage.setItem(`lastReadFriendRequestId_${this.userID}`, this.lastReadFriendRequestId.toString())
      }
    },

    setFriendRequest(friendRequest: ImTypes.FriendRequest) {
      this.friendRequestMap.set(friendRequest.id, friendRequest)
      // 同步更新辅助 Set
      this.friendRequestUserIds.add(friendRequest.from_user_id)
      this.friendRequestUserIds.add(friendRequest.to_user_id)
    },

    getFriendRequest(id: number): ImTypes.FriendRequest | undefined {
      return this.friendRequestMap.get(id)
    },

    hasFriendRequest(id: number): boolean {
      return this.friendRequestMap.has(id)
    },

    deleteFriendRequest(requestId: number) {
      const request = this.friendRequestMap.get(requestId)
      if (request) {
        // 检查是否还有其他请求涉及这些用户
        this.friendRequestMap.delete(requestId)
        const fromId = request.from_user_id
        const toId = request.to_user_id
        // 重新检查是否还有其他请求包含这些用户
        let hasFrom = false, hasTo = false
        for (const req of this.friendRequestMap.values()) {
          if (req.from_user_id === fromId || req.to_user_id === fromId) hasFrom = true
          if (req.from_user_id === toId || req.to_user_id === toId) hasTo = true
          if (hasFrom && hasTo) break
        }
        if (!hasFrom) this.friendRequestUserIds.delete(fromId)
        if (!hasTo) this.friendRequestUserIds.delete(toId)
      }
    },

    isFriendRequest(id: number): boolean {
      return this.friendRequestUserIds.has(id)
    },

    // ==================== Batch Operations ====================
    setUsers(users: ImTypes.UserInfo[]) {
      users.forEach(user => this.userMap.set(user.user_id, user))
    },

    setFriends(friends: ImTypes.Friend[]) {
      friends.forEach(friend => this.friendMap.set(friend.friend_id, friend))
    },

    setFriendRequests(requests: ImTypes.FriendRequest[]) {
      requests.forEach(request => this.setFriendRequest(request))
    },

    // ==================== Clear ====================
    clearAll() {
      this.userMap.clear()
      this.friendMap.clear()
      this.friendRequestMap.clear()
      this.friendRequestUserIds.clear()
      this.lastReadFriendRequestId = 0
    }
  },
  getters: {
    // 获取未读待处理的请求数量（接收者是我，且状态为 Pending，且ID大于上次读取ID）
    unreadPendingRequestCount: (state) => {
      let count = 0;
      for (const req of state.friendRequestMap.values()) {
        if (req.from_user_id === state.userID && req.status === ImTypes.ApplyStatus.APPLY_STATUS_PENDING)
          continue;

        if (req.id > state.lastReadFriendRequestId) {
          count++;
        }
      }
      return count;
    },

    // 获取所有好友列表
    friendList: (state) => {
      return Array.from(state.friendMap.values())
    },

    // 获取所有好友请求列表
    friendRequestList: (state) => {
      return Array.from(state.friendRequestMap.values())
    }
  }
})
