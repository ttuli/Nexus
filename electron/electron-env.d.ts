/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    /**
     * The built directory structure
     *
     * ```tree
     * ├─┬─┬ dist
     * │ │ └── index.html
     * │ │
     * │ ├─┬ dist-electron
     * │ │ ├── main.js
     * │ │ └── preload.js
     * │
     * ```
     */
    APP_ROOT: string
    /** /dist/ or /public/ */
    VITE_PUBLIC: string
    /** Auth server URL */
    VITE_AUTH_SERVER: string
    /** User server URL */
    VITE_USER_SERVER: string
    /** Group server URL */
    VITE_GROUP_SERVER: string
    /** WebSocket server URL */
    VITE_WS_SERVER: string
  }
}

// Used in Renderer process, expose in `preload.ts`
interface Window {
  ipcRenderer: import('electron').IpcRenderer
  process: {
    platform: NodeJS.Platform
    versions: NodeJS.ProcessVersions
    env: NodeJS.ProcessEnv
  }
}
