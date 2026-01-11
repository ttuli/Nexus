import { defineStore } from 'pinia'
import { jwtDecode } from "jwt-decode";
import { TokenPayload } from '@/types/common'

export const useUserStore = defineStore('user', {
  state: () => ({
    token: '',
    refreshToken: '',
    userID: ''
  }),
  actions: {
    setToken(token: string) {
      this.token = token
      if (token === '') return
      const payload = jwtDecode<TokenPayload>(token)
      this.userID = payload.user_id
    },
    getToken() {
      return this.token
    },
    setRefreshToken(refreshToken: string) {
      this.refreshToken = refreshToken
    },
    getRefreshToken() {
      return this.refreshToken
    },
    getUserID() {
      return this.userID
    }
  }
})
