推荐分层架构与落地指南

> 本节针对问题清单第 1、2 条（Service/Store 职责边界模糊、Service 间循环依赖）给出**可执行的目标架构、代码规范和迁移步骤**，作为团队共识写入项目文档，后续重构以此为准绳。

### 3.1 目标分层

采用「四层架构」，业务协调归 Store，底层能力归 Service，页面级流程编排归 Composables：

```
┌──────────────────────────────────────────────────────────┐
│  组件 (views/, components/)                                │
│  UI 展示与交互                                              │
│  调用 Composables / Store / Services                       │
└────────────────────┬─────────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────────┐
│  Composables (src/composables/)                           │
│  可复用的有状态逻辑：封装 UI 行为、生命周期、副作用、局部状态  │
│  页面级流程编排：协调多个 Store action                       │
└────────────────────┬─────────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────────┐
│  Store (src/store/, Pinia)                                │
│  全局状态管理 + 业务协调                                    │
│  调用 Services，管理 loading / error / 共享状态             │
└────────────────────┬─────────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────────┐
│  Services (src/services/)                                │
│  底层能力封装：HTTP / IPC / WebSocket / 文件 / SQLite       │
│  只做"取数 + 数据转换"，不管状态                            │
└────────────────────┬─────────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────────┐
│  Apis / Repositories（可选）                                │
│  apis/: 纯请求封装（axios 实例）                             │
│  repositories/: 多个 Service 共享的底层访问逻辑（消除重复）    │
└──────────────────────────────────────────────────────────┘
```

**为什么不引入独立的 Controller 层**：前端没有"HTTP 协议入口"这个天然分界，Controller 与 Service 边界极易塌陷；Nexus 已有 `composables/` 目录，它就是前端的"页面级聚合层"，再引入 Controller 会造成两层语义重叠、调用链变长、调试成本上升。

**关键设计决策**：
1. **Store 是业务协调的核心**。业务流程（取数 → 改状态 → 管 loading/error）收敛在 Store action 里，而不是散落在 Service 中。这是 Pinia 的主流用法，也让"状态 + 操作该状态的逻辑"内聚在一起，便于测试和追踪。
2. **Service 不调 Store、不管状态**。Service 退化为纯底层能力封装，只负责"取数 + 数据转换（含 `toRaw` 剥响应式）"，返回 Promise。这样 Service 之间不再需要互相调用，**循环依赖的结构性诱因自动消解**（原 `messageService` 动态 `import('./chatService')` 可删除）。
3. **Composable 承担页面级跨 Store 编排**。当一个页面流程需要同时操作 `messageStore` + `sessionStore` + `userStore` 时，由 Composable 依次调用各 Store action 完成编排，而不是让某个 Store 去调另一个 Store（避免 Store 间耦合）。
4. **组件可直接调 Store/Service**，但跨 Store 或需要 loading/error 管理的请求应走 Store action；一次性、无状态的取数可以直连 Service。

### 3.2 各层职责与边界（一页速查）

| 层级 | 核心职责 | 能做什么 | 不做什么 |
|---|---|---|---|
| **组件** | UI 展示与交互 | 调用 Composables / Store / Services | 不直接写 HTTP/IPC 细节；不持有跨页面共享的业务状态 |
| **Composables** | 可复用的有状态逻辑 | 封装 UI 行为、生命周期、副作用、局部状态；**编排多个 Store action 完成页面级流程** | 不直接调用底层 HTTP/IPC；不管理全局状态 |
| **Store** | 全局状态管理 + 业务协调 | 调用 Services；管理 loading/error/共享状态；action 内做校验/埋点/持久化 | 不直接写 `axios`/`ipcRenderer` 细节；不在 action 里调别的 Store（跨 Store 编排交给 Composable） |
| **Services** | 底层能力封装 | 封装 HTTP、IPC、文件、本地存储等调用细节；做数据转换（`toRaw`） | 不管理状态；不调用 Store；Service 之间不互相依赖 |

**补充约定**：
- **Service 间禁止互相 import**。共享的底层访问逻辑下沉到 `repository`（可选层），而非让 Service A 调 Service B。
- **Store 之间禁止互相调用**。跨 Store 的流程编排统一放到 Composable，由 Composable 依次调各 Store action。
- **Repository 是可选优化层**，不是独立分层。当多个 Service 需要复用同一段底层访问逻辑时才引入，作为 Service 的实现细节存在。

### 3.3 代码规范示例

#### 3.3.1 Store 层规范

**原则**：Store 是业务协调中心，action 内部调 Service、管 loading/error、改状态。

```ts
// src/store/messageStore.ts
import { defineStore } from 'pinia'
import { messageService } from '@/services/messageService'
import type { IChatMessage } from '@shared/types'

export const useMessageStore = defineStore('message', {
  state: () => ({
    messages: [] as IChatMessage[],
    isLoading: false,
    hasMore: true,
  }),

  getters: {
    messageCount: (s) => s.messages.length,
  },

  actions: {
    // ✅ 内部状态写入辅助，语义化命名
    prependMessages(list: IChatMessage[]) {
      if (!list?.length) return
      const existingIds = new Set(this.messages.map((m) => m.msg_id))
      const deduped = list.filter((m) => !existingIds.has(m.msg_id))
      this.messages.unshift(...deduped)
    },

    appendMessages(list: IChatMessage[]) {
      this.messages.push(...list)
    },

    clearMessages() {
      this.messages.splice(0, this.messages.length)
      this.hasMore = true
    },

    // ✅ 业务流程收敛在 action：调 Service + 管状态
    async loadMore(sessionId: string) {
      if (this.isLoading || !this.hasMore) return
      this.isLoading = true
      try {
        const before = this.messages[this.messages.length - 1]?.msg_id
        const list = await messageService.fetchHistory(sessionId, { before })
        this.prependMessages(list)
        this.hasMore = list.length >= 20
      } finally {
        this.isLoading = false
      }
    },

    async send(sessionId: string, content: string) {
      const saved = await messageService.send({ sessionId, content, timestamp: Date.now() })
      this.appendMessages([saved])
    },
  },
})
```

```ts
// src/store/sessionStore.ts
import { defineStore } from 'pinia'
import type { ISession } from '@shared/types'

interface SessionSummaryPatch {
  lastContent?: string
  lastSender?: string
  updateTime?: number
  unreadCount?: number
}

export const useSessionStore = defineStore('session', {
  state: () => ({
    sessionList: [] as ISession[],
    currentSessionId: '' as string,
  }),

  actions: {
    // ✅ 跨字段更新收敛到一个 action，Composable/组件不需要知道 session 内部结构
    updateSessionSummary(sessionId: string, patch: SessionSummaryPatch) {
      const s = this.sessionList.find((x) => x.session_id === sessionId)
      if (!s) return
      if (patch.lastContent !== undefined) s.last_content = patch.lastContent
      if (patch.lastSender !== undefined) s.last_sender = patch.lastSender
      if (patch.updateTime !== undefined) s.update_time = patch.updateTime
      if (patch.unreadCount !== undefined) s.unread_count = patch.unreadCount
    },

    setCurrentSession(sessionId: string) {
      this.currentSessionId = sessionId
    },

    bumpUnread(sessionId: string) {
      const s = this.sessionList.find((x) => x.session_id === sessionId)
      if (s) s.unread_count = (s.unread_count ?? 0) + 1
    },
  },
})
```

#### 3.3.2 Service 层规范

**原则**：Service 是底层能力封装，只做取数 + 数据转换，不管状态，不调 Store。

```ts
// src/services/messageService.ts
import { messageApi } from '@/apis/messageApi'
import { toRaw } from 'vue'
import type { IChatMessage } from '@shared/types'

interface SendPayload {
  sessionId: string
  content: string
  timestamp: number
}

export const messageService = {
  // ✅ 纯取数，不做状态管理
  async fetchHistory(sessionId: string, opts: { before?: string } = {}): Promise<IChatMessage[]> {
    return messageApi.fetchHistory(sessionId, opts)
  },

  // ✅ 发送前用 toRaw 剥响应式，不用 JSON.parse(JSON.stringify())
  async send(payload: SendPayload): Promise<IChatMessage> {
    return messageApi.send(toRaw(payload))
  },

  // ✅ 涉及 IPC 到主进程 SQLite 的本地写入
  async saveLocal(msg: IChatMessage): Promise<void> {
    return window.nexus.db.insertMessage(toRaw(msg))
  },
}
```

```ts
// src/services/chatService.ts
// ✅ 不再 import messageService；两者各自封装自己的底层调用
export const chatService = {
  async notifyPeerTyping(sessionId: string, isTyping: boolean) {
    return window.nexus.ws.send({ type: 'typing', sessionId, isTyping })
  },
}
```

#### 3.3.3 Composables 层规范

**原则**：Composable 持有页面局部状态，编排多个 Store action 完成页面级流程，对组件是唯一业务入口。

```ts
// src/composables/useChatPage.ts
import { ref } from 'vue'
import { useSessionStore } from '@/store/sessionStore'
import { useMessageStore } from '@/store/messageStore'
import { chatService } from '@/services/chatService'

export function useChatPage() {
  const sessionStore = useSessionStore()
  const messageStore = useMessageStore()
  const inputText = ref('')          // 页面局部状态，不进全局 Store
  const isSending = ref(false)

  async function init(sessionId: string) {
    sessionStore.setCurrentSession(sessionId)
    messageStore.clearMessages()
    await messageStore.loadMore(sessionId)
  }

  async function loadMore() {
    await messageStore.loadMore(sessionStore.currentSessionId)
  }

  // ✅ 跨 Store 编排：发消息后同时更新 message 和 session 摘要
  async function send() {
    if (!inputText.value.trim()) return
    isSending.value = true
    try {
      await messageStore.send(sessionStore.currentSessionId, inputText.value)
      sessionStore.updateSessionSummary(sessionStore.currentSessionId, {
        lastContent: inputText.value,
        updateTime: Date.now(),
      })
      await chatService.notifyPeerTyping(sessionStore.currentSessionId, false)
      inputText.value = ''
    } finally {
      isSending.value = false
    }
  }

  return { inputText, isSending, init, loadMore, send }
}
```

#### 3.3.4 组件层规范

**原则**：组件只管渲染 + 调 Composable；简单的一次性取数可直连 Service，但跨 Store 或需要 loading 管理的流程一律走 Store action。

```vue
<!-- src/views/ChatView.vue -->
<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useChatPage } from '@/composables/useChatPage'

const route = useRoute()
const { inputText, isSending, init, loadMore, send } = useChatPage()

onMounted(() => init(route.params.sessionId as string))
</script>

<template>
  <div class="chat-view">
    <MessageList :on-load-more="loadMore" />
    <MessageInput v-model="inputText" :disabled="isSending" @send="send" />
  </div>
</template>
```

#### 3.3.5 可选：引入 Repository 消除 Service 重复

当多个 Service 需要复用同一段底层访问逻辑时，把它下沉到 `repositories/`，作为 Service 的实现细节（不是独立分层）。

```ts
// src/repositories/messageRepository.ts
import { messageApi } from '@/apis/messageApi'
import { toRaw } from 'vue'
import type { IChatMessage } from '@shared/types'

export const messageRepository = {
  async fetchHistory(sessionId: string, opts: { before?: string } = {}) {
    return messageApi.fetchHistory(sessionId, opts)
  },
  async saveLocal(msg: IChatMessage) {
    return window.nexus.db.insertMessage(toRaw(msg))
  },
}
```

```ts
// messageService 和 chatService 都依赖 messageRepository，不互相依赖
import { messageRepository } from '@/repositories/messageRepository'

export const messageService = {
  fetchHistory: messageRepository.fetchHistory,
  async send(payload) {
    const saved = await messageApi.send(toRaw(payload))
    await messageRepository.saveLocal(saved)   // 复用 repository
    return saved
  },
}
```

### 3.4 从现状迁移的步骤

> 按依赖方向自底向上重构，每步都可独立提交、独立验证，避免大爆炸式重写。

**第 1 步：把 Service 里的业务编排上移到 Store action**
- `messageService.loadMoreMessages()` 中管理 `isLoading/hasMore`、`prepend`、跨 store 更新 session 摘要的逻辑，全部搬进 `messageStore.loadMore()` action。
- `messageService.sendMessage()` 的状态写入搬进 `messageStore.send()` action。
- Service 暂时仍保留旧方法作为薄封装，双写并存，不破坏现有调用。

**第 2 步：Service 退化为底层能力封装**
- 删掉 Service 对 Store 的所有引用（`useMessageStore()`、`useSessionStore()`）。
- Service 只保留：调 `apis`/`ipcRenderer`/`ws` + 数据转换（`toRaw`），返回 Promise。
- 把 `JSON.parse(JSON.stringify())` 统一替换为 `toRaw()`。

**第 3 步：删除 Service 间动态 import，循环依赖自动消解**
- 由于 Service 不再调 Store、不再承担编排，`messageService` 与 `chatService` 不再需要互相调用，删掉 `await import('./chatService')`。
- 如仍有共享底层逻辑，引入 `repository`（可选）。

**第 4 步：补齐 Store action 的状态守门语义**
- 在 `messageStore` / `sessionStore` 中补 `prependMessages`、`appendMessages`、`setLoading`、`updateSessionSummary` 等内部辅助 action，确保所有状态写入都通过 action 完成（外部不再直接改字段）。

**第 5 步：把页面级跨 Store 编排收敛到 Composables**
- 新建 `src/composables/useChatPage.ts` 等，把组件里散落的"调多个 Store + 管局部状态"逻辑搬进去。
- 组件改为只调 composable。

**第 6 步：补单元测试**
- **Store action**：mock Service，验证"调了哪些 Service、传了什么参数、状态如何变化"——这是该分层最大的回报，业务逻辑内聚在 Store，测试无需启动真实请求。
- **Service**：mock `apis`/`ipcRenderer`，验证"调了哪些底层方法、参数是否 `toRaw` 过"，不依赖任何 Store。
- **Composable**：mock Store action，验证编排顺序和局部状态。

### 3.5 反模式清单（禁止事项）

以下写法一旦在 review 中出现，应直接打回：

| 反模式 | 示例 | 正确做法 |
|---|---|---|
| Service 调 Store / 改 Store 字段 | `messageService` 里 `messageStore.messages.unshift(x)` | 编排上移到 Store action，Service 只管取数 |
| Store action 里写 `axios`/`ipcRenderer` 细节 | `await axios.get(...)` in action | 放 Service，action 调 Service |
| Store 之间互相调用 | `messageStore` 里 `useSessionStore().updateX()` | 跨 Store 编排放 Composable |
| Service 间动态 import 规避循环依赖 | `await import('./chatService')` | 共享逻辑下沉 repository，或编排上移 Store |
| Composable 直接调 `axios`/`ipcRenderer` | `await axios.get(...)` in composable | 委托 Store action 或 Service |
| `JSON.parse(JSON.stringify())` 剥响应式 | `JSON.parse(JSON.stringify(msg))` | `toRaw(msg)` |
| 新增 `any` 类型 | `const cur: any = ...` | 使用 `share/types` 中的接口 |

### 3.6 命名约定

为降低认知负担，各层命名遵循以下约定：

- **Store**：`use{Domain}Store`，如 `useMessageStore`、`useSessionStore`、`useUserStore`。
- **Service**：`{Domain}Service`（对象名），如 `messageService`、`chatService`；底层能力封装，无状态。
- **Composable**：`use{PageName}` 或 `use{FeatureName}`，如 `useChatPage`、`useContactList`。
- **Repository**（可选）：`{Domain}Repository` / `{domain}Repository`，如 `messageRepository`。
- **Api**：`{Domain}Api` / `{domain}Api`，如 `messageApi`，仅封装 axios 请求实例。

---

## 四、改进路线图建议

### 阶段一：短期修复（1周内，低成本高收益）
- [ ] 移除 `package.json` 中的 `i` 依赖，调整 `@types/*` 到 `devDependencies`，核实并修正 `axios` 版本号。
- [ ] 修复 `CreateWindow()` 中配置对象被污染的 Bug（深拷贝后再合并）。
- [ ] 修复 `WebSocketManager.init()` 覆盖构造函数配置的问题。
- [ ] 修正 `closeAllWindows()` 注释与代码不一致，补充 `.catch()`。
- [ ] `dev` 脚本改为跨平台写法。

### 阶段二：中期治理（1个月内）
- [ ] 引入 ESLint + Prettier，并在 CI 中强制执行。
- [ ] 为 WebSocket 重连、消息队列、窗口管理补充单元测试，覆盖核心分支逻辑。
- [ ] 按「3.4 从现状迁移的步骤」执行 Store/Service/Composable 分层重构。
- [ ] 全局清理 `any` 类型，尽量复用 `share/types` 中已定义的类型。

### 阶段三：长期演进（按需排期）
- [ ] 搭建 CI/CD 流水线（lint → test → build → electron-builder 打包）。
- [ ] 引入语义化版本管理与自动化 changelog。
- [ ] 评估将主进程单例模块（`windowManager`、`wsManager`）改造为依赖注入风格，提升可测试性。
- [ ] 统一代码注释语言规范与命名风格，补充团队代码规范文档（CONTRIBUTING.md）。

---

## 五、总结

Nexus 的整体分层思路（主进程/渲染进程/共享层）是合理且现代的 Electron 应用架构范式，核心问题集中在：

1. **实现细节上的健壮性 Bug**（配置对象污染、初始化覆盖、超时注释不符）；
2. **职责边界模糊**（Service 直接操作 Store 内部状态、承担业务编排，Store 沦为哑数据容器）；
3. **工程化基础设施缺失**（无 Lint、测试覆盖率低、无 CI）。

建议优先解决"高优先级"中列出的稳定性问题，再按第三节给出的四层架构（组件 → Composables → Store → Services）与迁移步骤逐步收敛职责边界：业务协调归 Store、底层能力归 Service、页面级跨 Store 编排归 Composables。该方案层级简洁、符合 Pinia 主流用法，且 Service 不再调 Store 后循环依赖的结构性诱因自动消解。长期通过测试和类型系统的强化保障重构安全性。本评审的分层建议已具体到代码示例与迁移步骤，可作为团队重构的执行手册。