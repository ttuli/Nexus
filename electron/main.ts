import { app, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { windowManager } from './windows/windowManager'
import { resourceManager, cacheManager } from './resource'
import { registerProtocols } from './protocol'
import { wsManager } from './websocket'
import { IpcChannels } from '../src/types/ipc'
import { fileCacheManager } from './resource/fileCacheManager'

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

function createWindow(): void {
  windowManager.CreateWindow({
    key: 'login',
  });
}

// 设置全局应用名，影响窗口默认标题、任务栏和托盘等展示
app.setName('IMChat')
app.whenReady().then(() => {
  // 初始化本地文件缓存管理器
  fileCacheManager.init();

  // 注册自定义协议 (imcache://, imlocal://)
  registerProtocols();

  // 初始化资源管理器
  resourceManager.init();
  createWindow()

  // 直接关闭登录窗口触发
  ipcMain.on(IpcChannels.QUIT, () => {
    resourceManager.setStoreRefreshToken(true);
    cacheManager.flushToDisk();
    windowManager.closeAllWindows().finally(() => {
      wsManager.disconnect();
      app.quit();
    })
  })

  ipcMain.on(IpcChannels.LOGOUT, () => {
    resourceManager.setStoreRefreshToken(false);
    windowManager.closeAllWindows().finally(() => {
      windowManager.CreateWindow({
        key: 'login',
      })
    })
  })
})

app.on('window-all-closed', (e: Event) => {
  // 始终阻止 Electron 自动退出，由 closeAllWindows() Promise 链显式控制
  e.preventDefault();
});
