import { FriendApplyInfo,GroupApplyInfo } from '@/models/social'
import { defineStore } from 'pinia'
import { reactive } from 'vue'
import JSONbig from 'json-bigint';

export const useApplyStore = defineStore('apply', {
  state: () => ({
    FriendApplyMap: reactive(new Map<bigint, FriendApplyInfo>()),
    GrooupApplyMap: reactive(new Map<bigint, GroupApplyInfo>()),
    hasPull: false,
  }),
  actions: {
    setFriendApply(applyInfo: FriendApplyInfo) {
      window.ipcRenderer.send('window:publish', {
        channel: 'new-apply-info',
        data: {
          type: 'friend',
          applyInfo: { ...applyInfo }
        }
      })
    },
    setGroupApply(applyInfo: GroupApplyInfo) {
      window.ipcRenderer.send('window:publish', {
        channel: 'new-apply-info',
        data: {
          type: 'group',
          applyInfo: { ...applyInfo }
        }
      })
    },
    Fserialize(): string {
      const obj: Record<string, any> = {};

      this.FriendApplyMap.forEach((value, key) => {
        obj[key.toString()] = value;
      });

      return JSONbig.stringify(obj);
    },
    Fdeserialize(jsonString: string) {
      const obj = JSONbig.parse(jsonString);
      this.FriendApplyMap.clear();

      Object.entries(obj).forEach(([key, value]: [string, any]) => {
        this.FriendApplyMap.set(BigInt(key), value as FriendApplyInfo);
      });
    },
    Gserialize(): string {
      const obj: Record<string, any> = {};

      this.GrooupApplyMap.forEach((value, key) => {
        obj[key.toString()] = value;
      });

      return JSONbig.stringify(obj);
    },
    Gdeserialize(jsonString: string) {
      const obj = JSONbig.parse(jsonString);
      this.GrooupApplyMap.clear();

      Object.entries(obj).forEach(([key, value]: [string, any]) => {
        this.GrooupApplyMap.set(BigInt(key), value as GroupApplyInfo);
      });
    }
  }
})