import { app, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'
import './fs'
import { windowManager } from './windows/windowManager'
import { registerKeytarHandlers } from './keytar'
import './utils/resourceManager' // 注册资源管理器 IPC 处理器

const require = createRequire(import.meta.url)
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
  registerKeytarHandlers()
  createWindow()

  ipcMain.on('quit', () => {
    windowManager.closeAllWindows()
  })
})

// 当所有窗口关闭时，如果不是 macOS 或明确要求退出，则隐藏到托盘
app.on('window-all-closed', (e: Event) => {
  if (!windowManager.isRequireQuit()) {
    // 阻止默认行为（不退出应用），窗口会隐藏到托盘
    e.preventDefault();
  } else {
    // 明确要求退出，真正退出应用
    app.quit();
  }
});

// macOS 特殊处理：当应用被激活时，如果没有窗口则创建登录窗口
app.on('activate', () => {
  if (windowManager.getWindow('home') === null && windowManager.getWindow('login') === null) {
    windowManager.CreateWindow({ key: 'login' });
  }
});
