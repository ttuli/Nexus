import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { FriendInfo } from '@/models/social'
import JSONbig from 'json-bigint'


export const useContactStore = defineStore('contact', {
    state: () => ({
        Friends: reactive<FriendInfo[]>([]),
        Groups: [] as bigint[],
    }),
    actions: {
        setFriend(friend: FriendInfo) {
            const index = this.Friends.findIndex(f => f.user_id.toString() === friend.user_id.toString())
            if (index !== -1) {
                this.Friends[index] = friend
            } else {
                this.Friends.push(friend)
            }
        },
        HasGroup(id: bigint) {
            const arr = this.Groups
            let lo = 0, hi = arr.length - 1
            while (lo <= hi) {
                const mid = (lo + hi) >> 1
                const v = arr[mid]
                if (v === id) return true
                if (v < id) lo = mid + 1
                else hi = mid - 1
            }
            return false
        },
        AddGroup(id: bigint) {
            const arr = this.Groups
            let lo = 0, hi = arr.length
            while (lo < hi) {
                const mid = (lo + hi) >> 1
                const v = arr[mid]
                if (v < id) lo = mid + 1
                else hi = mid
            }
            if (arr[lo] === id) return
            arr.splice(lo, 0, id)
        },
        Fserialize() {
            return JSONbig.stringify(this.Friends)
        },
        Fdeserialize(friendsJson: string) {
            const friends = JSONbig.parse(friendsJson)
            this.Friends = reactive(friends)
        },
    }
})