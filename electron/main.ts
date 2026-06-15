import * as dotenv from 'dotenv';
dotenv.config();

import { app, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { resourceManager } from './resource'
import { IpcChannels } from '@/src/types/ipc'
import { APP_CONSTANTS } from '@/src/config/constants'

export const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

// 设置全局应用名，影响窗口默认标题、任务栏和托盘等展示
app.setName(APP_CONSTANTS.ApplicationName)

app.whenReady().then(() => {
  // 初始化资源管理器
  resourceManager.init();

  // 直接关闭登录窗口触发
  ipcMain.on(IpcChannels.QUIT, () => {
    resourceManager.destroy();
  })

  ipcMain.on(IpcChannels.LOGOUT, () => {
    resourceManager.kickout();
  })
})

app.on('window-all-closed', () => {
  // 始终阻止 Electron 自动退出，由 closeAllWindows() Promise 链显式控制
  // (在 Electron 中，只要监听了 window-all-closed 事件，就不会自动退出，不需要 preventDefault)
});
