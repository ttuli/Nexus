import { FriendApplyInfo,GroupApplyInfo } from '@/models/social'
import { defineStore } from 'pinia'
import { reactive } from 'vue'
import JSONbig from 'json-bigint';
import { ApplyMsg, WsMessage } from '@/models/message';
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
    ApplyUpdate(message:WsMessage) {
      if (!document.hasFocus()) {
        try {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.type = 'sine'
          osc.frequency.value = 880
          osc.connect(gain)
          gain.connect(ctx.destination)
          gain.gain.setValueAtTime(0.0001, ctx.currentTime)
          gain.gain.exponentialRampToValueAtTime(0.1, ctx.currentTime + 0.02)
          osc.start()
          setTimeout(() => {
            try {
              gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18)
              osc.stop()
            } finally {
              ctx.close()
            }
          }, 200)
        } catch {}
      }
      const msg = message.extra?.apply as ApplyMsg
      if (msg.type === 'friend') {
        const applyInfo = this.FriendApplyMap.get(msg.apply_id)
        if (applyInfo) {
          applyInfo.status = msg.status
          applyInfo.message = msg.reason
          applyInfo.time = BigInt(msg.update_at)
        } else {
          this.setFriendApply({
            apply_id: msg.apply_id,
            status: msg.status,
            user_id: BigInt(msg.relation_id),
            sender_id: BigInt(message.sender_id as bigint),
            message: msg.reason,
            time: BigInt(msg.update_at),
          })
        }
      } else if (msg.type === 'group') {
        const applyInfo = this.GrooupApplyMap.get(msg.apply_id)
        if (applyInfo) {
          applyInfo.status = msg.status
          applyInfo.message = msg.reason
        } else {
          console.log(message)
          this.setGroupApply({
            request_id: msg.apply_id,
            status: msg.status,
            group_id: BigInt(msg.relation_id),
            sender_id: BigInt(message.sender_id as bigint),
            message: msg.reason,
            request_time: msg.update_at,
          })
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
