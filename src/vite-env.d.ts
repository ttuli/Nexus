/// <reference types="vite/client" />

// Electron 在 File 对象上注入了 path 属性（本地绝对路径）
// 标准 DOM 类型定义中没有，需要手动扩展
interface File {
  readonly path: string
}

interface ImportMetaEnv {
  VITE_AUTH_SERVER: string
  VITE_USER_SERVER: string
  VITE_GROUP_SERVER: string
  VITE_FILE_SERVER: string
  VITE_WS_SERVER: string
  VITE_SOCIAL_SERVER: string
  VITE_MESSAGE_SERVER: string

  VITE_ICON_VERSION: string
}

// 声明 .vue 文件模块
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}
