import { app, ipcMain, protocol } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { windowManager } from './windows/windowManager'
import { resourceManager } from './resource'
import { IpcChannels } from '../src/types/ipc'
import { wsManager } from './websocket'

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
  // 注册 file:// 协议处理器
  protocol.registerFileProtocol('imag', (request, callback) => {
    const url = request.url.substr(7)
    callback(decodeURI(path.normalize(url)))
  });

  // 初始化资源管理器
  resourceManager.init();
  createWindow()

  // 直接关闭登录窗口触发
  ipcMain.on(IpcChannels.QUIT, () => {
    resourceManager.setStoreRefreshToken(true);
    windowManager.setExitting(true);
    windowManager.closeAllWindows()
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
  if (windowManager.getExitting()) {
    wsManager.disconnect()
    app.quit();
  } else {
    e.preventDefault();
  }
});
