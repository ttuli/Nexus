## 项目简介

IMChat 前端，一个基于 **Electron + Vue 3 + TypeScript** 的桌面即时通讯客户端。  
项目包含：
- **Electron 主进程**：窗口管理、托盘、协议注册、自定义缓存、WebSocket 管理
- **Vue 渲染进程**：聊天 UI、联系人、设置等页面
- **IndexedDB 本地存储**：聊天记录本地持久化与离线加载
- **自定义协议**：`imcache://`、`imlocal://`、`imlocalraw://` 用于图片缓存与本地预览

## 技术栈

- 桌面框架：Electron
- 前端框架：Vue 3 `<script setup>` + TypeScript
- 构建工具：Vite
- 状态管理：Pinia
- UI 组件：Element Plus、Vant
- 数据序列化：Protobuf（`@bufbuild/protobuf` / `ts-proto`）
- 本地存储：IndexedDB（聊天记录）、自定义文件缓存（头像、图片等）

## 运行与构建

### 环境要求

- Node.js 18+
- pnpm / yarn / npm 任一包管理器

### 安装依赖

```bash
pnpm install
# 或
yarn
# 或
npm install
```

### 开发模式（仅渲染进程 HMR）

```bash
pnpm dev
```

在另一个终端中启动 Electron（如果你有全局 electron，可以手动指向 `dist-electron/main.js`，通常通过项目内脚本启动）。

### 生产构建

```bash
pnpm build
```

该命令会：
- 使用 `vue-tsc` 做类型检查
- 构建渲染进程资源（Vite）
- 使用 `electron-builder` 打包应用

## 目录结构（简版）

- `electron/`：主进程代码
  - `main.ts`：入口，窗口与资源初始化
  - `protocol/`：自定义协议注册
    - `index.ts`：注册 `imcache://`、`imlocal://`、`imlocalraw://`
  - `resource/`：
    - `fileCacheManager.ts`：文件缓存与本地图片裁剪 / 原图返回
    - 其他 *Manager：用户、群组、好友、Token 等资源管理
  - `websocket/`：WebSocket 连接、消息路由与 ACK 队列
  - `windows/`：窗口配置与窗口管理

- `src/`：渲染进程（前端）
  - `main.ts`：Vue 入口
  - `App.vue`：应用根组件
  - `views/`：页面（登录、首页、聊天、联系人、设置等）
  - `components/`：通用 UI 组件（对话框、输入框、头像等）
  - `store/`：Pinia 状态（用户、群组、聊天等）
  - `services/`：业务服务（WebSocket、消息、缓存、窗口、IPC 等）
  - `utils/chat.ts`：聊天相关工具函数，包含：
    - `toNetworkPreviewUrl`：将网络图片转换为 `imcache://` 地址
    - `toLocalPreviewUrl`：本地图片缩略图 `imlocal://...?...width=XXX`
    - `toLocalPreviewUrlRaw`：本地图片原图预览 `imlocalraw://...`

## 自定义协议说明

- **`imcache://`**
  - 用途：网络图片的本地磁盘缓存（头像、聊天图片等）
  - 行为：
    - 命中缓存：主进程直接通过 `file://` 读取本地文件返回
    - 未命中：触发后台下载，本次请求回退到原始 URL

- **`imlocal://`**
  - 用途：本地图片缩略图预览
  - 参数：
    - `width`：最大宽度，未传时主进程使用默认值（目前为 250）
  - 行为：使用 `nativeImage` 等比缩放并缓存缩略图

- **`imlocalraw://`**
  - 用途：本地图片原图预览
  - 行为：主进程不做裁剪，不做压缩，直接以 `file://` 返回原始文件内容

## 聊天记录加载（seq 区间）

后端接口 `GetHistory` 对应的 `start_seq` / `end_seq` 语义与 `FindByConversation` 一致：

- `start_seq >= 0`：下界（含）
- `end_seq >= 0`：上界（含）
- **负数表示无界**

前端 `chatService.getHistoryMessages` 的行为：

- 优先从 IndexedDB 按 `sendTime` 拉取旧消息
- 本地没有时，按 seq 区间调用后端：
  - 首次拉取：`start_seq = -1, end_seq = -1` → 获取最新一页
  - 向旧消息翻页：`start_seq = -1, end_seq = beforeSeq - 1`

## 开发建议

- 推荐使用 VS Code / Cursor，配合 Volar 与 TypeScript 支持
- 主进程与渲染进程的 IPC 通道统一定义在 `src/types/ipc.ts`
- 修改协议相关逻辑时，请保持：
  - `electron/resource/fileCacheManager.ts`
  - `electron/protocol/index.ts`
  - `src/utils/chat.ts`
  这三处的 Scheme / 编码方式 一致
