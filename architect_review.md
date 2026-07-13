
#### R1. `messageStore.messages` 单一会话设计存在竞态风险

**位置：** [`message.ts`](file:///d:/Project/Nexus/src/store/message.ts) — `messages: [] as IChatMessage[]`

当前 Store 只维护**一个**会话的消息列表，切换会话时调用 `resetMessageState()`。在以下场景存在竞态：

```
用户切换会话 A → B
  → resetMessageState()  （清空）
  → loadMore() 发起 HTTP 请求（异步）
  ← 用户又切回 A
  ← loadMore 的响应到达，写入的是 B 的消息，但当前显示 A
```

虽然 `loadMore` 中有 `currentSessionKey` 检查，但 `upsertMessage`（来自 Listener）没有 session 校验，**异步的历史消息回调仍可能污染当前视图**。

**建议：** 考虑 `Map<sessionKey, IChatMessage[]>` 的多会话缓存，或增强所有异步回调的 session guard。


#### R2. `ChatService` 离线同步无取消机制

**位置：** [`chatService.ts`](file:///d:/Project/Nexus/src/services/chatService.ts#L325-L333)

`syncOfflineActiveSessions` 用 `offlineSyncInFlight` 防重入，但分页拉取最多 `maxPages=20` 轮、每轮 `pageSize=50` 条，**最多可能发起 1000 条消息的 HTTP 请求序列**，中间无法取消（用户登出时可能仍在进行）。

**建议：** 引入 `AbortController` 或取消令牌（CancellationToken）机制，配合 resourceManager 生命周期。

---

### 🟡 中等风险

#### R4. `WebSocketManager.init()` 中存在配置覆盖 Bug

**位置：** [`WebSocketManager.ts`](file:///d:/Project/Nexus/electron/websocket/WebSocketManager.ts#L72)

```typescript
init(): void {
    // ...
    this.config = { ...DEFAULT_CONFIG, ...config.wsConfig }; // ← config 变量遮蔽问题
}
```

`config` 此处是从 `@shared/config/constants` import 的模块级变量，但同时构造函数参数也叫 `config`（类型 `WsManagerConfig`）。这导致构造时传入的配置在 `init()` 时被**无条件覆盖**，传入的自定义配置（如 `msgTimeoutMs`）会丢失。

---

#### R5. `offlineNotify` 使用硬编码 IPC 字符串

**位置：** [`routes.ts`](file:///d:/Project/Nexus/electron/websocket/routes.ts#L129)

```typescript
windowManager.broadcastMessage('ws:offline-notify', { ... }); // ❌ 未使用 IpcChannels 枚举
```

Preload 的白名单基于 `IpcChannels` 枚举，这里绕过了枚举，**既破坏白名单，又是 TODO 标记表明逻辑未完成**。

---

#### R6. `IpcService.once()` 监听器清理逻辑错误

**位置：** [`ipcService.ts`](file:///d:/Project/Nexus/src/services/ipcService.ts#L59-L71)

`once()` 方法中创建了 `onceWrapper` 但注册到 `ipcRenderer` 的仍是原始 `callback`，`onceWrapper` 只存在于内部 listeners map，实际上两套引用不同步，`off()` 无法正确移除 once 监听器，存在**内存泄漏风险**。

---

#### R7. `MessageQueue.receivedMessageIds` 无界增长风险

**位置：** [`MessageQueue.ts`](file:///d:/Project/Nexus/electron/websocket/MessageQueue.ts#L147-L153)

去重 Set 依赖 `setTimeout` 延迟清理，但 `setTimeout` 在主进程不精确，且消息量大时 Set 中条目数不受控制。**未设上限，高频场景下存在内存压力**。

**建议：** 改用 LRU Cache（项目已有 `lru-cache` 依赖，直接可用）限制条目数量。

---

### 🔵 低风险 / 代码质量

#### R8. `mapApiMessage` 中存在 magic string 型 extra key

**位置：** [`chatService.ts`](file:///d:/Project/Nexus/src/services/chatService.ts#L85-L93)

```typescript
width: this.normalizeNumber(extra.MESSAGE_EXTRA_KEY_WIDTH || extra.width),
```

`MESSAGE_EXTRA_KEY_WIDTH` 既像枚举 key 又像字符串 key，属于历史遗留设计，可读性和可维护性差。


#### R10. `chatService.ts` 中 `var` 风格声明

**位置：** [`chatService.ts`](file:///d:/Project/Nexus/src/services/chatService.ts#L426)

```typescript
case ImTypes.GroupOperationType.GROUP_OP_JOIN:
    let group = await groupService.fetchByIds([groupNotification.group_id]); // ← let 在 case 块中
```

`switch` 语句中 `let/const` 不加 `{}` 会有作用域共享问题，建议加花括号。

---