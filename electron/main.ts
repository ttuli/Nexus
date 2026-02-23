import { app, ipcMain, protocol, net } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { windowManager } from './windows/windowManager'
import { resourceManager } from './resource'
import { IpcChannels } from '../src/types/ipc'
import { wsManager } from './websocket'
import { fileCacheManager, IMCACHE_SCHEME } from './resource/fileCacheManager'

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

  // 注册 imcache:// 自定义协议：将网络图片请求映射到本地磁盘缓存
  protocol.handle(IMCACHE_SCHEME, (request) => {
    const localPath = fileCacheManager.handleProtocolRequest(request.url);
    if (localPath) {
      // 本地缓存命中，通过 Electron 的 net.fetch 读取本地文件（ESM 安全）
      return net.fetch('file://' + localPath);
    }
    // 本地缓存 miss，解码出原始 URL 并重定向到网络图片（兜底）
    const encoded = request.url.replace(`${IMCACHE_SCHEME}://`, '').split('?')[0];
    try {
      const originalUrl = Buffer.from(encoded, 'base64url').toString('utf-8');
      return net.fetch(originalUrl);
    } catch {
      return new Response(null, { status: 404 });
    }
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
