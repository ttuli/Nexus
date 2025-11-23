import { FriendApplyInfo,GroupApplyInfo } from '@/models/social'
import { defineStore } from 'pinia'
import { reactive } from 'vue'
import JSONbig from 'json-bigint';
import { ApplyMsg } from '@/models/message';
import { ElMessage } from 'element-plus';

export const useApplyStore = defineStore('apply', {
  state: () => ({
    FriendApplyMap: reactive(new Map<string, FriendApplyInfo>()),
    GrooupApplyMap: reactive(new Map<string, GroupApplyInfo>()),
    FriendIDMap: new Map<bigint,string>(),
    GroupIDMap: new Map<bigint,string>(),
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
    ApplyUpdate(msg:ApplyMsg) {
      if (msg.type === 'friend') {
        const applyInfo = this.FriendApplyMap.get(msg.apply_id)
        if (applyInfo) {
          applyInfo.status = msg.status
          applyInfo.message = msg.reason
          applyInfo.time = BigInt(msg.update_at)
        }
      } else if (msg.type === 'group') {
        const applyInfo = this.GrooupApplyMap.get(msg.apply_id)
        if (applyInfo) {
          applyInfo.status = msg.status
          applyInfo.message = msg.reason
        }
      } else {
        ElMessage.error('未知的申请类型')
      }
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
        this.FriendApplyMap.set(key, value as FriendApplyInfo);
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
        this.GrooupApplyMap.set(key, value as GroupApplyInfo);
      });
    }
  }
})