import { app, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'
import './fs'
import { windowManager } from './windows/dialogs'

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
  createWindow()

  ipcMain.on('quit', () => {
    windowManager.closeAllWindows()
  })
})

app.on('window-all-closed', (e: Event) => {
  if (!windowManager.isRequireQuit()) {
    e.preventDefault()
  } else {
    app.quit()
  }
})
