import * as dotenv from 'dotenv';
dotenv.config();

import { app, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { resourceManager } from './resource'
import { updateManager } from './update/updateManager'
import { setupMediaPermission } from './windows/mediaPermission'
import { IpcChannels } from '@shared/types/ipc'
import { APP_CONSTANTS } from '@shared/config/constants'

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

// 单实例：主窗口关闭只是隐藏到托盘，再次双击快捷方式若另起实例，会多出登录窗和托盘图标，
// 还会与已有实例共用 userData、本地库和设备 id。抢不到锁就退出，由已有实例在 second-instance 里唤起界面。
// app.quit() 不会当场结束进程、ready 照样会触发，所以启动逻辑都放在 else 里，保证本实例什么都不初始化
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    resourceManager.showCurrentWindow();
  })

  app.whenReady().then(async () => {
    // 通话需要麦克风/摄像头：显式放行，避免 getUserMedia 被静默拒绝
    setupMediaPermission();

    // 初始化资源管理器
    resourceManager.init();

    // 更新安装同样走优雅退出链，只把最后的 app.quit 换成安装
    updateManager.init((onQuit) => resourceManager.destroy(onQuit));

    // 直接关闭登录窗口触发
    ipcMain.on(IpcChannels.QUIT, () => {
      resourceManager.destroy();
    })

    ipcMain.on(IpcChannels.LOGOUT, () => {
      resourceManager.kickout();
    })

    // 版本检查先于登录窗：版本过低直接进更新窗口，不先弹出登录窗再关掉
    const forced = await updateManager.checkOnStartup();
    if (!forced) {
      resourceManager.showLogin();
    }
  })
}

app.on('window-all-closed', () => {
  // 始终阻止 Electron 自动退出，由 closeAllWindows() Promise 链显式控制
  // (在 Electron 中，只要监听了 window-all-closed 事件，就不会自动退出，不需要 preventDefault)
});
