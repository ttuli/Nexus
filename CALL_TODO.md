# WebRTC 语音/视频通话 —— 前端待办

配对后端清单：`IMChat/CALL_TODO.md`

**功能已完整**：入口按钮 → 发起 → 铃声 → 接听 → SDP/ICE 协商 → 挂断 → 通话记录气泡 → 上线补投，
含媒体权限、设备跟随、登出收尾。`vue-tsc --noEmit` + `vite build` 通过。
已完成部分的设计理由写在对应代码注释里，本文件只留待办。

**当前可用性**：局域网 / 同 NAT 下可完整跑通。
**唯一阻塞项是跨 NAT 连不上**——只有 STUN，TURN 是后端待办。

---

## 1. 发送码率封顶 ⬜

- [ ] SDP 改 `b=AS`（或 `RTCRtpSender.setParameters` 的 `maxBitrate`）显式封顶发送码率
      - 采集侧约束已在 `CALL_CONFIG.videoConstraints`（720p/24fps），
        但**采集分辨率 ≠ 发送码率**：上行带宽富余时编码器会一路冲高，
        跑满上行既拖累对端也直接推高 TURN 中继成本
      - 取值与后端 TURN 容量规划同一条决策

## 2. ICE / TURN ⬜（依赖后端）

- [ ] **改为后端下发**：`CALL_CONFIG.iceServers` 已做成 getter 并支持
      `VITE_STUN_SERVER` / `VITE_TURN_SERVER` / `VITE_TURN_USERNAME` / `VITE_TURN_CREDENTIAL`，
      后端接口就绪后**只需替换这个 getter 的实现**，调用方无需改动
- [ ] 环境变量里的 TURN 凭证只是开发期兜底，**生产必须用后端下发的短时凭证** ——
      静态密码放在客户端等于公开

## 3. 待定决策 ⬜

- [ ] **视频通话是否允许以摄像头关闭状态接通**
      —— 若允许，建连时要显式 `addTransceiver('video', { direction: 'sendrecv' })` 占住 m-line，
      否则接通后第一次开摄像头会变成加轨 → 触发重协商。**当前实现假设不允许**

## 4. 范围外（明确不做）

- **手动选择音视频设备**：已定为**跟随系统默认**，不做设备下拉菜单。
  用户在系统里换默认设备（插耳机等），通话自动跟过去
- **摄像头跟随系统默认**：只做了麦克风。插 USB 摄像头时画面突然切换比较突兀，
  且用户预期与音频不同。要加的话逻辑与麦克风完全一致
- **群通话**：`GroupCall.vue` 保持 UI 占位、不接信令
- **语音中途升级为视频**：音频 SDP 没有 video m-line，加视频轨必然重协商。
  双按钮设计已规避 —— 需保证语音通话界面不出现开摄像头入口

---

## 已完成部分索引

| 模块 | 文件 | 要点 |
|---|---|---|
| proto | `share/types/proto/call/` | 与后端镜像；`index.ts` 的 `export *` 需手动维护 |
| 配置 | `share/config/constants.ts` `CALL_CONFIG` | ICE / 视频窗口尺寸 / 采集约束 / 铃声 / 关窗延时。`IceServerConfig` 不用 DOM 的 `RTCIceServer`——本文件主进程也加载，那边没有 DOM lib |
| 媒体权限 | `electron/windows/mediaPermission.ts` | 同时设 RequestHandler 与 CheckHandler（只设前者时查询侧可能先返回 denied）；只放行 media 类且校验请求方是应用自身页面 |
| 主进程路由 | `electron/websocket/routes.ts` | 800-809 十个类型全注册 → 广播；补了 `CHAT_CALL(106)` → `handleChatMessage` |
| 信令直发 | `WebSocketManager.sendSignal` | **绕开 MessageQueue**：`enqueue` 对无 `clientId` 的帧直接 return，走 `send()` 会被静默丢弃 |
| service | `src/services/callService.ts` | 纯 I/O，7 个方法，不 import store |
| listener | `listeners/wsCallListener.ts` | 只管拉起窗口；**必须排除主叫自己的 invite 回执**，否则给自己弹接听界面 |
| 通话控制器 | `src/composables/useCallState.ts` | PeerConnection + 信令；late offer；`replaceTrack` 不重协商；关摄像头 `stop()` 灭指示灯 |
| 上线补投 | `views/home/index.vue` | 重连分支 + 冷启动分支各调一次 `queryPending` |
| 入口 | `views/home/chat/SessionContent.vue` | 语音/视频两个按钮，`media_type` 发起时确定 |
| 记录气泡 | `Bubble/CallMessageBubble.vue` | 按 `fromUserId` 算主被叫视角；未接标红；点击回拨类型跟随原通话 |
| 记录解码 | `messageConverter.ts` / `chatService.ts` | WS 走 payload、历史走 extra 两条路径都要有 106 分支 |
| 未读特判 | `listeners/wsMessageListener.ts` | `!isFromSelf` 守卫 + 被叫侧 `COMPLETED`/`REJECTED` 调 `reportSessionRead` 而非 `incrementUnread`，**必须推进服务端游标**否则刷新会被打回 |

### 几个容易踩回去的点

- **信令广播到所有窗口，主窗口与通话窗各取所需**：主窗口只处理 `CALL_INVITE`/`CALL_PENDING`
  （拉起窗口），SDP/ICE/END 由通话窗内的 `useCallState` 直接消费。
  避免主窗口做 ICE 中转——两个渲染进程之间转发高频小包很难看
- **媒体状态走 WS `CALL_MEDIA_UPDATE`，不用 DataChannel**：首次 offer 之后再
  `createDataChannel` 会新增 `m=application` 段并触发重协商，正是要避开的东西
- **登出收尾必须挂 `LOGOUT_REMIND` 而不能只挂 `APP_QUIT`**：两条退出路径 WS 关闭时机不同——
  退出应用是「窗口先关、WS 后断」，登出/被踢是「**WS 先断**、再关窗口」，
  等到 APP_QUIT 时连接已经没了，hangup 必然发不出去，对端要等 sweeper 超时才收敛
- **音频输出不需要任何代码**：从不调 `setSinkId()`，`<video>` 走系统默认输出并自动跟随；
  **输入必须显式跟随**——`getUserMedia` 把 track 绑死在采集那一刻的默认设备上，
  插耳机后自己听筒换了、对方听到的却还是内置麦克风
- **通话窗需要 `autoplayPolicy: 'no-user-gesture-required'`**：新开窗口没有用户交互，
  `new Audio().play()` 会被自动播放策略拦掉，而来电铃声恰恰必须在用户操作前响起。
  远端音视频不受影响（Chromium 对 WebRTC MediaStream 免除该策略）
- **`windowSize` 是 `CreateWindowRequest` 顶层字段**，塞进 `data` 会变成 URL query 而静默失效
- **通话记录不做本地乐观插入**：由服务端铸造并投递给双方（后端已补投主叫）。
  客户端合成会引入自造 msg_id/seq，与拉历史回来的服务端行按
  `(session_key, msg_id/client_id)` 去重时容易变成重复行
- **`wsMessageListener` 的未读分支必须先看 `isFromSelf`**：
  常规消息的发送方收不到自己的副本，所以这个守卫历史上"看起来多余"；
  但通话记录是**投递给双方**的，主叫会走到这个分支。漏掉就会给自己拨出的电话加红点，
  而服务端 `CountUnread` 按 `from_user_id` 排除本人 → 两边口径不一致，
  红点要等下次会话列表刷新才消失（2026-07-28 修）

### 挂断后通话记录的完整链路（排查时按这条走）

前端**没有**本地插入逻辑，全靠服务端铸造后投递：

| # | 位置 | 动作 |
|---|---|---|
| 1 | `gateway/dispatch/call.go` `onCallTerminate` | `CallState.Terminate` CAS，**赢家**才继续 |
| 2 | 同上 `publishCallRecord` | `util.NewCallRecordMsg` → JetStream 发 `DBSubject`，去重键 `call:{callID}` |
| 3 | `Message/rpc/listener/index.go` `process()` | `ResolveSessionID` 反解 sessionId（记录里 SessionId 留空）→ `PersistMessage` 落库，通话字段拆进 Extra |
| 4 | 同上 `deliverToUser` | 投 **Target**，**外加一份投 Sender**（主叫无本地副本，不补投就得等下次拉历史） |
| 5 | `gateway/server.go` `handleSubscribeMessage` | 按 `RouteTarget` 找本地连接 → `conn.Send` |
| 6 | `electron/websocket/routes.ts` | `wsRouteTable[CHAT_CALL]` → `handleChatMessage` → 广播 `WS_MESSAGE` |
| 7 | `listeners/wsMessageListener.ts` | `convertWSMessageToIChatMessage` 的 106 分支 → upsert + 落库 |

任一环断掉的症状都是「挂断后聊天里没有记录」，按上表逐段查。
