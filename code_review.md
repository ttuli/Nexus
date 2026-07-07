# 消息发送链路代码审查报告

链路覆盖范围：
`SessionContent.vue` → `ChatInput.vue` → `useChatPage.ts` → `messageStore` → `messageBuilder.ts` → `websocketService.ts` / `fileService.ts` / `messageService.ts` → `wsMessageListener.ts`

---

## 问题汇总（按严重程度排序）

### 🔴 严重问题

---

#### 1. `useChatPage` 中会话摘要与 Store 内的 `receiveMessage` 逻辑完全重复
**文件**：[useChatPage.ts](file:///d:/Project/Nexus/src/composables/useChatPage.ts#L47-L52) / [wsMessageListener.ts](file:///d:/Project/Nexus/src/services/listeners/wsMessageListener.ts#L36-L40)

发送消息后，`useChatPage` 手动调用 `sessionStore.updateSessionSummary()`：
```ts
// useChatPage.ts - 发送每种消息后都重复这段
sessionStore.updateSessionSummary(currentKey, {
    last_content: text,
    last_message_time: Date.now(),
    last_sender: userStore.userID
});
```
但收到 WS ACK 回来的消息时，`wsMessageListener` 又在 `receiveMessage()` 里通过 `upsertSession()` 再次更新了一次摘要。

**影响**：
- 发出的消息触发了两次 `sortSessionList()`（一次发送时，一次 ACK 回来时）
- `useChatPage` 中 4 个 `send*Message` 函数各自硬编码了摘要字符串（`'[图片]'`, `'[视频]'`, `'[文件]'`），与 `messageConverter.ts` 中的 `getLastContent()` 存在语义重复，且字段是硬编码字符串而非统一来源

**建议**：`messageStore.sendTextMessage` 等方法内部（或 `messageBuilder`）在消息构建完成后让 `receiveMessage` 统一处理摘要，`useChatPage` 不应再独立调用 `updateSessionSummary`。

---

#### 2. `messageBuilder.ts` 内部调用 Store（违反依赖方向）
**文件**：[messageBuilder.ts](file:///d:/Project/Nexus/src/utils/messageBuilder.ts#L77-L78)

```ts
function buildBase(type, sessionKey, existingClientId?) {
    const userStore = useUserStore();         // ❌ 工具函数直接使用 Store
    const conversationStore = useSessionStore(); // ❌
    ...
}
```

工具函数（`utils/`）直接调用 Pinia Store，导致：
1. 工具函数无法在 Store 初始化之前使用
2. 测试时必须 mock 整个 Store
3. 依赖关系混乱：`utils → store` 方向违反了"utils 应为纯函数"的约定

**建议**：将 `userId`、`sessionId`、`chatType` 等作为参数传入 `buildBase`，由调用方（`messageStore`）负责从 Store 中读取后注入，使 builder 成为纯函数。

---

### 🟠 中等问题

---

#### 3. `SessionContent.vue` 中 `handleSendMessage` 包装层没有价值
**文件**：[SessionContent.vue](file:///d:/Project/Nexus/src/views/home/chat/SessionContent.vue#L305-L307)

```ts
const handleSendMessage = async (content: string) => {
    await sendTextMessage(content);  // 仅仅是转发，无任何附加逻辑
};
```

同样，`handleSendImage` / `handleSendFile` 只是加了 `try/catch` 弹 `ElMessage`，而 `useChatPage` 内部已经有 `try/catch + console.error`。

**影响**：错误处理被分散在两处（组件层 + composable 层），策略不一致——组件层弹 toast，composable 层只 `console.error`，用户可能看不到错误，也可能重复处理。

**建议**：统一在 `useChatPage` 内部 `throw` 错误，或统一在组件层统一处理；二选一，不要两层各自吞掉部分错误。

---

#### 4. `messageStore` 中 `sendImageMessage` / `sendVideoMessage` / `sendFileMessage` 三函数结构高度重复
**文件**：[message.ts](file:///d:/Project/Nexus/src/store/message.ts#L229-L446)

三个函数（图片/视频/文件）的骨架完全一致：
```
获取 session → 构建本地消息 → upsertMessage → 上传文件 → 发送 WS → catch 标记失败 → finally 持久化
```
除了 `buildXxxLocalMsg`、`buildXxxWsPayload`、`FileType` 枚举值不同外，其他 80% 的代码是重复的（包括 `uploadAbortControllers` 操作、进度回调、错误处理）。

**建议**：提取一个 `sendMediaMessage(config: MediaSendConfig)` 私有辅助函数承担通用骨架，各类型只提供差异化的 builder 函数与 FileType。

---

#### 5. `messageStore` 内部多次重复调用 `useSessionStore()`
**文件**：[message.ts](file:///d:/Project/Nexus/src/store/message.ts#L201-L204), [L156-L157](file:///d:/Project/Nexus/src/store/message.ts#L156-L157), [L174-L175](file:///d:/Project/Nexus/src/store/message.ts#L174-L175)

在 `sendTextMessage` / `sendImageMessage` / `loadMore` 等每个 action 中，都有：
```ts
const sessionStore = useSessionStore();
```
甚至 `loadMore` 同一函数内调用了两次（`try` 块一次，`finally` 块一次）。

**建议**：在 `defineStore` 的 `actions` 中用 `useSessionStore()` 的结果缓存到模块级变量，或在 `setup store` 写法中统一注入。

---

#### 6. `buildVideoWsPayload` 中 `thumbnail_url` 硬编码为空字符串
**文件**：[messageBuilder.ts](file:///d:/Project/Nexus/src/utils/messageBuilder.ts#L357)

```ts
wsMsg.payload = ImTypes.VideoMessage.encode({
    ...
    thumbnail_url: '',  // ❌ 硬编码为空，localMsg.thumbnailUrl 被丢弃
    ...
}).finish();
```

发送视频时，本地消息已经生成了 `thumbnailUrl`，但 WS payload 里直接丢弃了，接收方无法看到视频封面。对比 `buildImageWsPayload` 中正确传递了 `thumbnail_url`，这是一个明显的遗漏 Bug。

---

### 🟡 轻微问题 / 代码规范

---

#### 7. `wsMessageListener.ts` 中保留了调试 `console.log`
**文件**：[wsMessageListener.ts](file:///d:/Project/Nexus/src/services/listeners/wsMessageListener.ts#L69), [L86](file:///d:/Project/Nexus/src/services/listeners/wsMessageListener.ts#L86)

```ts
console.log('[WsMessageListener] Received MessageAck:', data);
console.log('MessageAck 处理后消息: ', msg);
```
这两行 `console.log` 是调试级别的日志，在生产包中应移除或改用统一的日志工具。

---

#### 8. `fileService.ts` 中 `getImageUrl` 内保留了调试 `console.log`
**文件**：[fileService.ts](file:///d:/Project/Nexus/src/services/fileService.ts#L181)

```ts
console.log(checkRes)  // ❌ 生产代码中的裸 console.log
```

---

#### 9. `fileService.ts` 中 `checkLocalFileExists` 动态 import 已静态引入的模块
**文件**：[fileService.ts](file:///d:/Project/Nexus/src/services/fileService.ts#L218-L219)

```ts
const { ipcService } = await import('./ipcService');   // ❌ 文件顶部已经 import 了
const { IpcChannels } = await import('@shared/types/ipc');
```
`ipcService` 和 `IpcChannels` 在文件顶部已经静态引入，重复动态 import 无意义，徒增混乱。

---

#### 10. `SessionContent.vue` 中 `messages` watcher 使用 `deep: true` 监听大数组
**文件**：[SessionContent.vue](file:///d:/Project/Nexus/src/views/home/chat/SessionContent.vue#L231)

```ts
watch(messages, (newMsgs, oldMsgs) => { ... }, { deep: true });
```
`messages` 是一个包含所有消息的大数组，`deep: true` 会在每次响应式更新时深度遍历整个数组。由于每条消息的 `uploadProgress` 等字段会频繁变更，这会带来性能问题。

**建议**：改为 `{ deep: false }`（数组引用本身不变，新增消息会 push），通过比较 `length` 或最后一条消息 ID 来判断是否需要滚动，不依赖深度遍历。

---

#### 11. `useChatPage` 暴露了 `inputText` 和 `isSending` 但组件从未使用
**文件**：[useChatPage.ts](file:///d:/Project/Nexus/src/composables/useChatPage.ts#L32-L33), [L139-L141](file:///d:/Project/Nexus/src/composables/useChatPage.ts#L139-L141)

```ts
// SessionContent.vue 解构时
const { loadMore, sendTextMessage, sendImageMessage, sendVideoMessage, sendFileMessage } = useChatPage();
// inputText / isSending 从未被使用
```
`inputText` 已完全由 `ChatInput.vue` 内部管理，`useChatPage` 里维护的是一个孤立的冗余 ref。

---

#### 12. `ChatInput.vue` 中图片格式验证在 input `accept` 属性与 JS 逻辑中重复定义
**文件**：[ChatInput.vue](file:///d:/Project/Nexus/src/views/home/chat/components/ChatInput.vue#L33), [L124](file:///d:/Project/Nexus/src/views/home/chat/components/ChatInput.vue#L124)

```html
<input accept=".jpg,.jpeg,.png,.gif,.bmp,.webp" ...>
```
```ts
const ALLOWED_IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
```
两处列表需手动保持同步，应提取为一个常量同时赋值给 `accept` 和 JS 校验。

---

## 架构层次总览

```
SessionContent.vue
    └─ ChatInput.vue          (emit send/sendImage/sendFile)
         └─ useChatPage.ts    (orchestration composable)
              ├─ messageStore (状态 + 发送逻辑)
              │    ├─ messageBuilder.ts   (构建 WS payload & 本地消息)  ← ⚠️ 直接依赖 Store
              │    ├─ websocketService    (IPC → 主进程 → WS)
              │    ├─ fileService         (上传 OSS)
              │    └─ messageService      (持久化 SQLite)
              └─ sessionStore (更新会话摘要)   ← ⚠️ useChatPage 中重复调用
```
