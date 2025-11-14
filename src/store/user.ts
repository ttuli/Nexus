import { defineStore } from 'pinia'
import { UserInfo } from '@/models/user'

export const useUserStore = defineStore('user', {
  state: () => ({
    token: '',
    userInfo: {} as UserInfo
  }),
  getters: {
    userId: (state) => state.userInfo.user_id?.toString() || '',
    avatar: (state) => state.userInfo.avatar || '',
    userName: (state) => state.userInfo.user_name || '',
    phone: (state) => state.userInfo.phone || ''
  },
  actions: {
    setToken(token: string) {
      this.token = token
    },
    setUserInfo(userInfo: UserInfo) {
      this.userInfo = userInfo
    },
    getToken() {
      return this.token
    }
  }
})
