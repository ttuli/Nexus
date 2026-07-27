# WebRTC 语音/视频通话 —— 前端待办

配对后端清单：`IMChat/CALL_TODO.md`

**信令链路已打通**：入口按钮 → 发起 → 接听 → SDP/ICE 协商 → 挂断 → 上线补投，
`vue-tsc --noEmit` 与 `npm run build` 通过。已完成部分的设计理由写在对应代码注释里，本文件只留待办。

**当前可用性**：能打通、能接听、能挂断；但**通话结束后聊天里不显示记录气泡**（§1），
且**跨 NAT 大概率连不上**（依赖后端 TURN，见 `IMChat/CALL_TODO.md`）。

---

## 1. 通话记录渲染 ⬜ 未开始（链路闭环的最后一块）

后端已在终态落库 `CHAT_CALL(106)`，主进程路由也已注册，但渲染层还没有任何 106 分支，
**目前通话结束后聊天记录里什么都不显示**。

- [ ] 新建 `src/views/home/chat/components/Bubble/CallMessageBubble.vue`
      - 按 `media_type` + `end_reason` 分文案，并按 `base.from_user_id === 我` 区分主被叫视角：
        主叫视角 `已取消` / `对方已拒绝` / `对方无应答`；被叫视角 `已取消` / `已拒绝` / `未接来电`
      - `COMPLETED` 两边一致：`通话时长 03:21` / `视频通话 03:21`
      - 未接来电点击可回拨，**回拨类型跟随原通话的 `media_type`**
- [ ] `MessageBubble.vue` 增加 `CHAT_CALL(106)` 分派分支
- [ ] `src/utils/messageConverter.ts` 的 `getLastContent` 增加 106 分支
      - 函数顶部已有 `status === RECALLED` 前置判断，106 分支加在其后
      - 服务端下发的是**无主语中性文案**（`语音通话 未接听`），客户端按 `from_user_id` 重算视角文案
- [ ] `chatService.mapApiMessage` 增加 106 解码分支（「按 type 分派处必须补全」的地方）

### 1.1 未读特判（后端口径：106 计入未读）

后端 `CountUnread` 不排除 106（未接来电必须有红点）。记录的 `from_user_id` 恒为主叫，
所以只有被叫侧会产生未读。但被叫在「正常通话结束」「自己拒接」后同样会 +1，刚挂断就冒红点。

- [ ] **`end_reason ∈ {COMPLETED, REJECTED}` 时改调 `reportSessionRead`，不要 `incrementUnread`**
      - **必须推进服务端游标，不能只改本地数字**：服务端未读是点查、不存量化，
        只改本地会在下次会话列表刷新时被打回
      - `wsMessageListener` 里 `isCurrentSession` 分支已经是这个写法，照抄即可
      - 其余终态（`CANCELED`/`MISSED`/`PEER_OFFLINE`/`BUSY`/`FAILED`）走正常 `incrementUnread`

## 2. 设备与画面 ⬜

- [ ] **ICE 配置改为后端下发**：`useCallState.ts` 的 `ICE_SERVERS` 目前硬编码公共 STUN，
      跨 NAT 打不通。待后端 TURN 接口就绪后替换
- [ ] `enumerateDevices` 摄像头/麦克风列表 + 通话中切换设备
      （用 `replaceTrack`，**不要重建 PeerConnection**）
- [ ] 分辨率与码率上限约束（`applyConstraints` / SDP 改 b=AS），与后端 TURN 带宽预算对齐
- [ ] Electron 媒体权限：主进程 `setPermissionRequestHandler` 放行 media
- [ ] Windows 系统级摄像头/麦克风隐私开关被关时的提示
      （`useCallState.ensureLocalStream` 已有兜底文案，但未区分「权限拒绝」与「设备被占用」）

## 3. 收尾 ⬜

- [ ] 通话中主窗口退出/登出的处理（参考 `quit-persistence-flow` 的落盘约定）
- [ ] 来电铃声（`public/phonering.wav` 已存在，改版后未接回）
- [ ] `wsCallListener.forgetCall` 目前无人调用，`handledCalls` 只增不减。
      长会话累积量极小，但接 §1 时顺手在通话记录到达处调一次更干净

## 4. 待定决策 ⬜

- [ ] **视频默认分辨率与码率上限** —— 决定 §2 的 `applyConstraints` 取值，与后端同一条决策
- [ ] **视频通话是否允许以摄像头关闭状态接通**
      —— 若允许，建连时要显式 `addTransceiver('video', { direction: 'sendrecv' })` 占住 m-line，
      否则接通后第一次开摄像头会变成加轨 → 触发重协商（当前实现假设不允许）

## 5. 范围外（明确不做）

- **群通话**：`GroupCall.vue` 保持 UI 占位、不接信令，已移除对 `useCallState` 的依赖
- **语音中途升级为视频**：音频 SDP 没有 video m-line，加视频轨必然重协商。
  双按钮设计已规避 —— 需保证语音通话界面不出现开摄像头入口

---

## 已完成部分索引

| 模块 | 文件 | 要点 |
|---|---|---|
| proto | `share/types/proto/call/` | 与后端镜像；`index.ts` 的 `export *` 需手动维护 |
| 主进程路由 | `electron/websocket/routes.ts` | 800-809 十个类型全注册 → 广播；补了 `CHAT_CALL(106)` → `handleChatMessage` |
| 信令直发 | `WebSocketManager.sendSignal` | **绕开 MessageQueue**：`enqueue` 对无 `clientId` 的帧直接 return，走 `send()` 会被静默丢弃 |
| service | `src/services/callService.ts` | 纯 I/O，7 个方法，不 import store |
| listener | `listeners/wsCallListener.ts` | 只管拉起窗口；**必须排除主叫自己的 invite 回执**，否则给自己弹接听界面 |
| 通话控制器 | `views/call/composables/useCallState.ts` | PeerConnection + 信令；late offer；`replaceTrack` 不重协商；关摄像头 `stop()` 灭指示灯 |
| 上线补投 | `views/home/index.vue` | 重连分支 + 冷启动分支各调一次 `queryPending` |
| 入口 | `views/home/chat/SessionContent.vue` | 语音/视频两个按钮，`media_type` 发起时确定 |
| 窗口 | `views/call/CallWindow.vue` | query 传参；视频用 `windowService.createWindow` 第三参覆盖为 800×600 |

### 架构决定

- **信令广播到所有窗口，主窗口与通话窗各取所需**：主窗口只处理 `CALL_INVITE`/`CALL_PENDING`
  （拉起窗口），SDP/ICE/END 由通话窗内的 `useCallState` 直接消费。
  避免主窗口做 ICE 中转——两个渲染进程之间转发高频小包很难看
- **媒体状态走 WS `CALL_MEDIA_UPDATE`，不用 DataChannel**：首次 offer 之后再
  `createDataChannel` 会新增 `m=application` 段并触发重协商，正是要避开的东西
- **`windowSize` 是 `CreateWindowRequest` 顶层字段**，塞进 `data` 会变成 URL query 而静默失效，
  故 `windowService.createWindow` 加了第三个参数
