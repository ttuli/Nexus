/// <reference types="vite/client" />

interface ImportMetaEnv {
  VITE_AUTH_SERVER: string
  VITE_USER_SERVER: string
  VITE_GROUP_SERVER: string
  VITE_FILE_SERVER: string
  VITE_WS_SERVER: string
  VITE_SOCIAL_SERVER: string
  VITE_MESSAGE_SERVER: string
}

// 声明 .vue 文件模块
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}
