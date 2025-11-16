import { defineStore } from 'pinia'
import { UserInfo } from '@/models/user'
import { reactive } from 'vue'
import { GroupInfo } from '@/models/group'
import { getUserInfo } from '@/apis/user'
import { ElMessage } from 'element-plus'
import JSONbig from 'json-bigint';
import { getGroupList } from '@/apis/social'
import { sqlJsDB } from '@/utils/sqljs'

export const useRelationStore = defineStore('relationMap', {
  state: () => ({
    userMap: reactive(new Map<bigint, UserInfo>()),
    groupMap: reactive(new Map<bigint, GroupInfo>()),
    groupMemberMap: reactive(new Map<bigint, bigint[]>()),
    gettingQueue: new Set<bigint>(),
  }),
  actions: {
    setUser(userInfo: UserInfo) {
      window.ipcRenderer.send('window:publish', {
        channel: 'update-user-map',
        data: { ...userInfo }
      })
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
          member_ids: [],
        })
        if (!this.gettingQueue.has(id)) {
          this.gettingQueue.add(id)
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
                  member_ids: item.member_ids.map(BigInt),
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
                member_ids: res.data.member_ids.map(BigInt),
              })
            }
            this.gettingQueue.delete(id)
          }).catch((err) => {
            console.log(err)
            this.gettingQueue.delete(id)
          })
        }
      }
      return this.groupMap.get(id)
    },
    getUser(id: bigint) {
      if (!this.userMap.has(id)) {
        this.userMap.set(id, {
          user_id: id,
          user_name: 'unknown',
          gender: 0,
          avatar: '',
          personal_signature: '',
          phone: '',
          join_type: 1,
        })
        if (!this.gettingQueue.has(id)) {
          this.gettingQueue.add(id)
          getUserInfo([id]).then((res) => {
            const u = res.data.data[0]
            if (u) {
              const user = {
                user_id: BigInt(u?.user_id ?? u?.id ?? ''),
                user_name: String(u?.user_name ?? u?.name ?? ''),
                gender: u.gender,
                avatar: u?.avatar ?? '',
                personal_signature: u?.personal_signature ?? u?.signature ?? '',
                phone: u?.phone ?? '',
                join_type: u.join_type ?? 1
              }

              this.setUser(user)
            } else {
              ElMessage.error("获取用户数据失败")
            }
          }).catch((err) => {
            ElMessage.error("获取用户数据失败")
            console.error(err)
          }).finally(() => {
            this.gettingQueue.delete(id)
          })
        }
      }
      return this.userMap.get(id)
    },
    Fserialize(): string {
      const obj: Record<string, any> = {};

      this.userMap.forEach((value, key) => {
        obj[key.toString()] = value;
      });

      return JSONbig.stringify(obj);
    },
    Fdeserialize(jsonString: string) {
      const obj = JSONbig.parse(jsonString);
      this.userMap.clear();

      Object.entries(obj).forEach(([key, value]: [string, any]) => {
        this.userMap.set(BigInt(key), value as UserInfo);
      });
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
        const user = {
          user_id: BigInt(u?.user_id ?? u?.id ?? 0),
          user_name: String(u?.user_name ?? u?.name ?? ''),
          gender: Number(u?.gender ?? 0),
          avatar: String(u?.avatar ?? ''),
          personal_signature: String(u?.personal_signature ?? u?.signature ?? ''),
          phone: String(u?.phone ?? ''),
          join_type: Number(u?.join_type ?? 1),
        } as UserInfo
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
          member_ids: Array.isArray(g?.member_ids) ? g.member_ids.map((x: any) => BigInt(x)) : [],
        } as GroupInfo
        this.groupMap.set(group.id, group)
      })
      return { userCount: this.userMap.size, groupCount: this.groupMap.size }
    },
    GetMemberBySessionId(sessionId: string): bigint[] {
      let res : bigint[] = []
      if (sessionId.indexOf('_') === -1) {
        return this.groupMap.get(BigInt(sessionId))?.member_ids || []
      } else {
        res.push(BigInt(sessionId.split('_')[0]))
        res.push(BigInt(sessionId.split('_')[1]))
      }
      return res
    }
  }
})