import { defineStore } from 'pinia'

export const useUserStore = defineStore('user', {
  state: () => ({
    token: '',
    refreshToken: '',
  }),
  actions: {
    setToken(token: string) {
      this.token = token
    },
    getToken() {
      return this.token
    },
    setRefreshToken(refreshToken: string) {
      this.refreshToken = refreshToken
    },
    getRefreshToken() {
      return this.refreshToken
    }
  }
})
