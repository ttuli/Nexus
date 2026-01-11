import { defineStore } from 'pinia'
import { UserInfo } from '@/types/user'
import { reactive } from 'vue'
import { GroupInfo } from '@/models/group'
import { ElMessage } from 'element-plus'
import JSONbig from 'json-bigint';
import { getGroupList } from '@/apis/social'
import { sqlJsDB } from '@/utils/sqljs'
import { resourceManager } from '@/utils/resourceManager'

export const useRelationStore = defineStore('relationMap', {
  state: () => ({
    userMap: reactive(new Map<string, UserInfo>()),
    groupMap: reactive(new Map<bigint, GroupInfo>()),
    groupMemberMap: reactive(new Map<bigint, bigint[]>()),
    gettingQueue: new Set<string>(),
  }),
  actions: {
    setUser(userInfo: UserInfo) {
      // 更新本地 Map
      this.userMap.set(userInfo.user_id, userInfo)
    },
    setGroup(g: GroupInfo) {
      try {
        window.ipcRenderer.send('window:publish', {
          channel: 'update-group-map',
          data: { ...g }
        })
      } catch (error) {
        console.log(error)
      }
    },
    getGroup(id: bigint) {
      if (!this.groupMap.has(id)) {
        this.groupMap.set(id, {
          id: id,
          name: 'unknown',
          avatar: '',
          owner_id: BigInt(0),
          updated_at: 0,
          created_at: 0,
          members: [],
        })
        if (!this.gettingQueue.has(id.toString())) {
          this.gettingQueue.add(id.toString())
          getGroupList({
            name: '',
            id: id,
            ownerId: BigInt(0),
          }).then(res => {
            res = res.data
            if (Array.isArray(res.data)) {
              res.data.forEach(item => {
                this.setGroup({
                  id: BigInt(item.id),
                  name: item.name,
                  avatar: item.avatar,
                  owner_id: BigInt(item.owner_id),
                  updated_at: item.updated_at,
                  created_at: item.created_at,
                  members: item.members.map((m:any) => ({
                    group_id: BigInt(item.group_id),
                    user_id: BigInt(m.user_id),
                    role: m.role,
                    nickname: m.nickname,
                    joined_at: m.joined_at,
                  })),
                })
              })
            } else if (res) {
              this.setGroup({
                id: BigInt(res.data.id),
                name: res.data.name,
                avatar: res.data.avatar,
                owner_id: BigInt(res.data.owner_id),
                updated_at: res.data.updated_at,
                created_at: res.data.created_at,
                members: res.data.members.map((m:any) => ({
                  group_id: BigInt(m.group_id),
                  user_id: BigInt(m.user_id),
                  role: m.role,
                  nickname: m.nickname,
                  joined_at: m.joined_at,
                })),
              })
            }
            this.gettingQueue.delete(id.toString())
          }).catch((err) => {
            console.log(err)
            this.gettingQueue.delete(id.toString())
          })
        }
      }
      return this.groupMap.get(id)
    },
    getUser(id: string): UserInfo | undefined {
      // 先检查本地缓存
      if (this.userMap.has(id)) {
        return this.userMap.get(id)
      }

      // 如果正在获取，直接返回占位符
      if (this.gettingQueue.has(id)) {
        return this.userMap.get(id)
      }

      this.gettingQueue.add(id)

      resourceManager.getUsers([id]).finally(() => {
        this.gettingQueue.delete(id)
      })

      return this.userMap.get(id)
    },
    Gserialize() {
      return JSONbig.stringify(Array.from(this.groupMap.values()))
    },
    Gdeserialize(groupsJson: string) {
      const groups = JSONbig.parse(groupsJson) as GroupInfo[]
      groups.forEach(item => {
        this.groupMap.set(item.id, item)
      })
    },
    loadLocalCache() {
      const users = sqlJsDB.getUsers()
      users.forEach((u: any) => {
        const user: UserInfo = {
          user_id: String(u?.user_id ?? u?.id ?? ''),
          user_name: String(u?.user_name ?? u?.name ?? ''),
          gender: Number(u?.gender ?? 0),
          avatar: String(u?.avatar ?? ''),
          personal_signature: String(u?.personal_signature ?? u?.signature ?? ''),
          phone: String(u?.phone ?? ''),
          join_type: Number(u?.join_type ?? 1),
          create_time: Number(u?.create_time ?? 0),
          update_time: Number(u?.update_time ?? 0),
        }
        this.userMap.set(user.user_id, user)
      })
      const groups = sqlJsDB.getGroups()
      groups.forEach((g: any) => {
        const group = {
          id: BigInt(g?.id ?? g?.group_id ?? 0),
          name: String(g?.name ?? g?.group_name ?? ''),
          avatar: String(g?.avatar ?? ''),
          owner_id: BigInt(g?.owner_id ?? 0),
          created_at: Number(g?.created_at ?? 0),
          updated_at: Number(g?.updated_at ?? 0),
          members: Array.isArray(g?.members) ? g.members.map((x: any) => ({
            group_id: BigInt(x.group_id ?? 0),
            user_id: BigInt(x.user_id ?? 0),
            role: Number(x.role ?? 0),
            nickname: String(x.nickname ?? ''),
            joined_at: Number(x.joined_at ?? 0),
          })) : [],
        } as GroupInfo
        this.groupMap.set(group.id, group)
      })
      return { userCount: this.userMap.size, groupCount: this.groupMap.size }
    },
    GetMemberBySessionId(sessionId: string): bigint[] {
      let res : bigint[] = []
      if (sessionId.indexOf('_') === -1) {
        return this.groupMap.get(BigInt(sessionId))?.members.map(x => x.user_id) || []
      } else {
        res.push(BigInt(sessionId.split('_')[0]))
        res.push(BigInt(sessionId.split('_')[1]))
      }
      return res
    }
  }
})