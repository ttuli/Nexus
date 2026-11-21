import * as dotenv from 'dotenv';
// 开发时从项目根目录的 .env 读配置。打包后只用构建时写进包里的值，不读运行目录下的 .env，
// 免得启动目录里恰好有个 .env 就把服务器地址改掉
if (process.env.VITE_DEV_SERVER_URL) {
  dotenv.config();
}

import { app, ipcMain, Menu, protocol } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { resourceManager } from './resource'
import { updateManager } from './update/updateManager'
import { setupMediaPermission } from './windows/mediaPermission'
import { IpcChannels } from '@shared/types/ipc'
import { APP_CONSTANTS, LOCAL_CACHE_SCHEME } from '@shared/config/constants'

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

// 必须在 app ready 之前声明自定义协议权限：允许渲染层（开发 http:// 与生产 file://）通过 fetch() 读取 localcache:// 本地资源（如重发媒体消息）。
// corsEnabled: true 将协议加入 Chromium CORS 白名单；不开启 standard: true，避免 Chromium 把大小写敏感的 Base64 路径当成 host 强制转小写。
protocol.registerSchemesAsPrivileged([
  { scheme: LOCAL_CACHE_SCHEME, privileges: { supportFetchAPI: true, corsEnabled: true, bypassCSP: true } }
])

// 单实例：主窗口关闭只是隐藏到托盘，再次双击快捷方式若另起实例，会多出登录窗和托盘图标，
// 还会与已有实例共用 userData、本地库和设备 id。抢不到锁就退出，由已有实例在 second-instance 里唤起界面。
// app.quit() 不会当场结束进程、ready 照样会触发，所以启动逻辑都放在 else 里，保证本实例什么都不初始化
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    // 退出时正在后台等更新下载完（界面已全部收掉），由 updateManager 重新启动应用
    if (updateManager.handleSecondInstance()) return;
    resourceManager.showCurrentWindow();
  })

  app.whenReady().then(async () => {
    // 打包后去掉 Electron 默认菜单：窗口无边框看不到菜单栏，但它的快捷键照样生效
    // （Ctrl+Shift+I 调试工具、Ctrl+R 刷新页面、F11 全屏、Ctrl+加减号缩放），刷新还会丢掉渲染层状态
    if (app.isPackaged) {
      Menu.setApplicationMenu(null);
    }

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

    // 托盘「退出登录」经主窗口确认后触发
    ipcMain.on(IpcChannels.USER_LOGOUT, () => {
      resourceManager.logout();
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
