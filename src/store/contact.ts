import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { FriendInfo } from '@/models/social'
import JSONbig from 'json-bigint'


export const useContactStore = defineStore('contact', {
    state: () => ({
        Friends: reactive<FriendInfo[]>([]),
        Groups: reactive<bigint[]>([]),
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
        AddGroup(id:bigint) {
            if (!this.Groups.includes(id)) {
                this.Groups.push(id)
                this.Groups.sort((a, b) => (a > b ? 1 : -1))
            }
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