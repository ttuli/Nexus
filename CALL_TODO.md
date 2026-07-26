# WebRTC 语音/视频通话 —— 前端实现清单

配对后端清单：`IMChat/CALL_TODO.md`（两边的 proto 段落必须同步改）。

**当前进度：§1 proto 同步已完成；§2-§9 待做。后端主链路已闭环并可联调。**

## 设计前提

1. **三个平面分离**
   - **信令平面**：invite / accept / reject / cancel / hangup / SDP / ICE —— **不落库**，纯 WS 实时收发。
   - **状态平面**：服务端 Redis，TTL = 振铃窗口。前端不维护跨会话的通话状态。
   - **记录平面**：一通电话**只有 1 条** `CHAT_CALL(106)` 消息，终态时由服务端写，前端只负责渲染。
2. **分层遵循 `nexus-frontend-layering`**：service 纯 I/O、store 纯状态、listener/composable 编排、view 直读。
3. `WindowKey.Call` 窗口链路已通（`share/config/windowKeys.ts` → `electron/windows/windowAttribute.ts`）。

---

## 0. 后端已定契约（动手前必读）

后端实现已落地，以下行为是**既成事实**，前端必须按此对接，不要自行发挥：

| 项 | 契约 |
|---|---|
| **握手** | **late offer** —— `CALL_INVITE` 只是通知。主叫**收到 `CALL_ACCEPT` 之后**才 `createOffer`，不要在发起时就产生 SDP |
| **call_id** | 服务端 uuid 分配。客户端上报的 **一律忽略**，不用自己生成 |
| **caller_id** | 服务端以 WS 连接身份为准。客户端自报的 **一律忽略** |
| **invite 回执** | 服务端把 `CALL_INVITE` **原类型回发给主叫**，带上分配好的 `call_id` 与 `ring_deadline`，兼作 ACK。主叫据此才知道自己这通电话的 ID |
| **`CALL_END(809)`** | **通话结束的统一信号**：对端挂断/拒接/取消、忙线、振铃超时、主叫掉线、发起失败，全部经此帧下发。前端只需处理这一个「通话结束」入口 |
| **忙线** | 主叫会收到 `CALL_END{reason: BUSY}`，不是错误码 |
| **振铃期挂断** | 客户端发 `CALL_HANGUP` 即可，服务端按状态归一：振铃中主叫发→记 `CANCELED`、被叫发→记 `REJECTED`。**前端不必自己区分该发哪个帧** |
| **pending 查询** | 走 **WS `CALL_PENDING(807)` 帧**，不是 HTTP。客户端发一帧空查询，服务端同类型回复 `has_pending` |
| **pending 复核** | 服务端已完成「主叫仍在线」+「剩余振铃 ≥ 5s」两项校验。**客户端拿到 `has_pending=true` 直接弹接听界面即可**，不用再判断 |
| **振铃超时** | 60s（`ring_deadline` 绝对时间戳随 invite 下发，UI 可据此显示倒计时） |
| **通话上限** | 4h，撞上限服务端按 `COMPLETED` 收敛 |
| **未读** | `CHAT_CALL(106)` **计入未读**，服务端不按 `end_reason` 细分。被叫在 `COMPLETED`/`REJECTED` 后的多余红点由前端 §7.1 消解 |

## 1. proto 同步 ✅

- [x] 同步 `pkg/proto/call/` → `share/types/proto/call/`（import 前缀 `pkg/proto/` → `proto/`）
- [x] 同步 `transport.proto` 的 800-809 信令段与 `message.proto` 的 `CallMessage`
- [x] `share/types/proto/index.ts` 手动加 `export * from './call/call'`（该文件不由脚本生成）
- [x] `npm run proto` + `vue-tsc --noEmit` 通过

## 2. 主进程 WS 路由

- [ ] `electron/websocket/routes.ts` 的 `wsRouteTable` 增加 **800-809** 信令类型 → 转发到渲染层
      - 参照撤回 605 的教训：**凡按 type 分派的地方都要补全**，漏一处就是整条链路死代码
      - 十个类型一个都不能少：`CALL_INVITE(800)` `CALL_ACCEPT(801)` `CALL_REJECT(802)` `CALL_CANCEL(803)`
        `CALL_HANGUP(804)` `CALL_SDP(805)` `CALL_ICE(806)` `CALL_PENDING(807)` `CALL_MEDIA_UPDATE(808)` `CALL_END(809)`
- [ ] 信令是高频小包（尤其 ICE candidate），确认不要进 `MessageQueue` 的去重/重试逻辑，直接透传

## 3. service 层（纯 I/O）

- [ ] 新建 `src/services/callService.ts`
      - 发信令帧：`invite(calleeId, sessionKey, mediaType)` / `accept(callId)` / `hangup(callId)`
        / `sendSdp(callId, type, sdp)` / `sendIce(callId, candidate)` / `sendMediaUpdate(callId, cameraOn, micOn)`
      - `queryPending()` —— 发一帧空 `CALL_PENDING`，回复经 listener 处理
      - **不用实现 `cancel`/`reject`**：统一发 `hangup`，服务端按状态归一（见 §0）
      - **不 import store**，入参出参都是数据

## 4. listener 层（编排）

- [ ] 新建 `src/services/listeners/wsCallListener.ts`，在 `listeners/index.ts` 注册
      - 收 `CALL_INVITE`：**要区分是来电还是自己的回执** —— `caller_id === 我` 即是回执（记下 `call_id`），
        否则是来电，拉起通话窗 `windowService.createWindow(WindowKey.Call, {...})`
      - 收 `CALL_ACCEPT`（主叫侧）→ **此时才开始 `createOffer`**（late offer）
      - 收 `CALL_END` → 统一的通话结束处理：关窗 + 按 `reason` 提示（忙线/未接/对方拒绝…）
      - 收 `CALL_SDP/CALL_ICE` → 喂给 RTCPeerConnection
      - 收 `CALL_MEDIA_UPDATE` → 更新对端媒体状态（对方关摄像头要显示头像占位，不能留黑屏）
      - 收 `CALL_PENDING` → `has_pending` 为真则拉起接听界面（服务端已校验完，直接弹）
- [ ] **按 `call_id` 幂等去重**：后端「先写状态再推送」的顺序下，实时推送与上线补投可能都命中同一通电话

### 4.1 媒体状态用 WS 信令，不用 DataChannel

摄像头/麦克风开关的通知走 `CALL_MEDIA_UPDATE(808)` WS 帧，**不要为此开 DataChannel**：

- **DataChannel 建晚了反而要重协商**：首次 offer 之后再 `createDataChannel` 会新增 `m=application` 段
  → 触发 `onnegotiationneeded` → 正是要避开的东西。要用就必须在首次 offer 前建好
- WS 通道已存在、已有路由与鉴权，加一个帧类型的成本远低于引入 SCTP 的连接态与失败模式
- 媒体状态是 UI 标志位，WS 多几十毫秒延迟无感知；DataChannel 的低延迟优势在这里用不上
- 后续若确有 P2P 数据需求（如通话内文件直传），再单独评估建 DataChannel

## 5. RTCPeerConnection 封装

- [ ] `src/views/call/composables/useCallState.ts` 目前是 UI 状态壳，接入真实信令
      - `getUserMedia` 采集：按 `media_type` 决定 `{ audio: true, video: true|false }`
      - **主叫的 `createOffer` 必须等到收到 `CALL_ACCEPT`**（late offer，见 §0）
      - setLocalDescription / setRemoteDescription / createAnswer
      - `onicecandidate` → `callService.sendIce`
      - `ontrack` → 绑定远端流到 `PrivateCall.vue` 的 video/audio 元素
      - 连接失败 / ICE 断开的降级与提示
- [ ] TURN/STUN 配置从后端下发或走环境变量，不硬编码（后端 §7 尚未开始，先留接口）

### 5.1 摄像头开关：不重协商（设计前提 + 唯一约束）

**结论：视频通话内部开关摄像头无需 SDP 重协商。** video m-line 在建连时已协商，
transceiver 一直在，`replaceTrack` 按规范就是为「不触发 SDP 变更地换轨」设计的。

- [ ] **前提：视频通话建连时必须真的协商出 video m-line**
      —— `getUserMedia({audio:true, video:true})` 后 `addTrack` 即可，正常流程自然满足。
      若产品上允许「视频通话以摄像头关闭状态接通」，要显式
      `addTransceiver('video', { direction: 'sendrecv' })` 占住 m-line，否则后面开摄像头就变成加轨 → 触发重协商
- [ ] 关摄像头用 **`sender.replaceTrack(null)` + 原 track `stop()`**，不要用 `track.enabled = false`
      - `enabled=false` 只是发黑帧，**摄像头指示灯不灭** —— 用户会认为仍在被拍摄，这是信任问题
      - `stop()` 后重新开启需再次 `getUserMedia`，有短暂延迟，属可接受代价
- [ ] 开摄像头：`getUserMedia` 拿新 track → `sender.replaceTrack(newTrack)`，同样不触发协商
- [ ] **对端 UI 靠显式信令驱动**，不要依赖 WebRTC 事件推断：
      `replaceTrack(null)` 后对端 track 不会立即 `mute`，`ontrack` 也不会再触发
- [ ] **唯一硬约束：语音通话不能中途升级为视频。**
      音频通话的 SDP 里没有 video m-line，加视频轨必然触发重协商。
      双按钮设计已规避此路径 —— 需在产品上确认「语音通话中不出现开摄像头按钮」，别让入口漏出来
      - 若将来要支持升级：语音建连时就 `addTransceiver('video', { direction:'sendrecv' })`
        用空轨占住 m-line，后续 `replaceTrack` 即可升级，仍不需重协商（代价仅为多一个 m-line）
- [ ] 因不走重协商，**无需 `onnegotiationneeded` 处理，也无需 glare 防护**
      —— 首次 offer/answer 之后 SDP 不再变动

### 5.2 视频专项：设备与画面

- [ ] `enumerateDevices` 摄像头/麦克风列表 + 通话中切换设备（`replaceTrack`，不要重建 PeerConnection）
- [ ] 呼出前本地预览（视频通话在拨号界面就该看到自己）
- [ ] 分辨率与码率上限约束（`applyConstraints` / SDP 改 b=AS），与后端 TURN 带宽预算对齐
- [ ] Electron 媒体权限：主进程 `setPermissionRequestHandler` 放行 media；
      Windows 系统级摄像头/麦克风隐私开关被关时给明确提示，不要静默失败

## 6. 上线补投（本次需求核心）

- [ ] 在 **渲染层** 发 `CALL_PENDING` 查询，**不要放主进程 WS 连接回调**
      - 原因：WS 在主进程，listener 在渲染层。主进程一连上就推，渲染层 listener 可能还没挂载
        （窗口 ready 握手未完成），这一推就掉地上
- [ ] 挂载点照抄 offlineSync 的位置，两个入口都要覆盖：
      - [ ] `src/views/home/index.vue:148` —— `ConnectionState.CONNECTED && wsWasDisconnected` 重连分支
      - [ ] `src/views/home/index.vue:172` —— 冷启动分支
- [ ] 收到 `has_pending=true` 直接拉起接听界面 —— 服务端已完成主叫存活与剩余振铃时间复核，
      客户端**不要再自行判断**（会与服务端口径不一致）
- [ ] `remaining_ms` 可用于接听界面的倒计时显示

## 7. 通话记录渲染

- [ ] 新建 `src/views/home/chat/components/Bubble/CallMessageBubble.vue`
      - 按 `media_type` + `end_reason` 分文案，并按 `base.from_user_id === 我` 区分主被叫视角：
        主叫视角 `已取消` / `对方已拒绝` / `对方无应答`；被叫视角 `已取消` / `已拒绝` / `未接来电`
      - `COMPLETED` 两边一致：`通话时长 03:21` / `视频通话 03:21`
      - 未接来电点击可回拨，**回拨类型跟随原通话的 `media_type`**
- [ ] `MessageBubble.vue` 增加 `CHAT_CALL(106)` 分派分支
- [ ] `src/utils/messageConverter.ts:302` 的 `getLastContent` 增加 106 分支
      - 注意函数顶部已有 `status === RECALLED` 前置判断，106 分支加在其后
      - 服务端下发的是**无主语中性文案**（`语音通话 未接听` / `视频通话 已取消`），
        客户端按 `from_user_id` 重算带视角的文案，与群通知 preview 同套路
- [ ] `chatService.mapApiMessage` 增加 106 解码分支（同样是「按 type 分派处必须补全」的地方）

### 7.1 未读处理（后端口径已定：106 计入未读）

后端 `CountUnread` 的排除列表只有 `[605, 606]`，**`CHAT_CALL(106)` 计入未读**——未接来电必须有红点。
记录的 `from_user_id` 恒为主叫，所以只有被叫侧会产生未读，主叫不会为自己拨出的电话产生未读。

- [ ] `electron/websocket/routes.ts` 把 `CHAT_CALL(106)` 挂到 `handleChatMessage`
      （现有表里 100-104、200-204 都挂在这个 handler，106 缺失）
- [ ] **`end_reason ∈ {COMPLETED, REJECTED}` 时改调 `reportSessionRead`，不要 `incrementUnread`**
      - 原因：这两种终态说明被叫本人刚参与过（接通聊完 / 主动拒接），
        不做特判的话「刚挂断就冒红点」
      - **必须推进服务端游标，不能只改本地数字**：服务端未读是点查、不存量化，
        只改本地会在下次会话列表刷新时被打回（`wsMessageListener` 里 `isCurrentSession`
        分支已经是这个写法，照抄即可）
      - 其余终态（`CANCELED` / `MISSED` / `PEER_OFFLINE` / `BUSY` / `FAILED`）走正常
        `incrementUnread`：这些都是被叫**没接到**的情况，红点是对的
- [ ] 离线补拉路径（`chatService.fetchMessagesSince`）同口径：
      拉到的历史通话记录不需要特判，服务端游标已经是权威

## 8. 通话窗口

- [ ] `src/views/call/CallWindow.vue` 接收 `callId` / `callerId` / `calleeId` / `isIncoming` / `mediaType` 参数
- [ ] `CallControlBar.vue` 的 accept/hangup 接到真实信令；`toggle-video` 接到 §5.1 的 `replaceTrack` 链路
      （UI 骨架已有 `isVideoEnabled` / `toggle-video`，`PrivateCall.vue` 也已有 remote/local video 元素，可直接复用）
- [ ] **窗口尺寸要按 `mediaType` 区分**：`windowAttribute.ts` 里 call 窗当前是 400×600、min 400×600，
      这是竖屏语音的尺寸，视频会被挤变形
      - 视频通话创建时用 `CreateWindowRequest.windowSize` 覆盖（建议 800×600），min 也要放宽
- [ ] 窗口关闭时确保释放媒体流与 PeerConnection（`onUnmounted` + `APP_QUIT` 两条路径都要覆盖）
      - **摄像头必须显式 `track.stop()`**，否则摄像头指示灯不灭，用户会认为在偷拍
- [ ] 通话中主窗口退出/登出的处理（参考 `quit-persistence-flow` 的落盘约定）

## 9. 入口按钮

- [ ] `SessionContent.vue` 现有的 `startCall`（`src/views/home/chat/SessionContent.vue:438`）拆成两个入口：
      语音通话 / 视频通话，分别带 `CALL_MEDIA_TYPE_AUDIO` / `CALL_MEDIA_TYPE_VIDEO`
- [ ] 现有入口条件是 `SESSION_TYPE_PRIVATE`，与「第一版只做私聊」一致，保持不变

## 10. 范围

- [ ] **第一版只做私聊**，走 `PrivateCall.vue`。`GroupCall.vue` 先挂着不接信令。
- [ ] 语音与视频由**入口按钮**区分，`media_type` 在发起时确定、通话期间不变
- [ ] 语音与视频同期做：信令完全一致，差异集中在 §5.2 设备画面、§7 记录文案、§8 窗口尺寸

---

## 待定决策

| # | 决策 | 状态 |
|---|---|---|
| 1 | 振铃超时秒数 | ✅ 60s（服务端 `callstate.RingTTL`，随 invite 下发绝对截止时间） |
| 2 | pending 补投走 HTTP 还是 WS | ✅ WS `CALL_PENDING(807)` 帧 |
| 3 | `CHAT_CALL` 是否计入未读 | ✅ **计入**。后端零改动；前端按 §7.1 处理 `COMPLETED`/`REJECTED` 特判 |
| 4 | 视频默认分辨率与码率上限 | ⬜ **待定**，直接决定后端 TURN 带宽预算 |
| 5 | 视频通话是否允许**以摄像头关闭状态接通** | ⬜ **待定**（若允许，见 §5.1 第一条：需显式 `addTransceiver` 占 m-line） |
