import { BrowserWindow, ipcMain, IpcMainEvent, Tray, Menu, nativeImage, app } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WindowConfig, ManagedWindow } from './windowAttribute';
import configs from './windowAttribute';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class WindowManager {
  private windows: Map<string, ManagedWindow> = new Map();
  private tray: Tray | null = null;

  constructor() {
    this.setupIpcHandlers();
  }

  private createTray() {
    this.tray = new Tray(nativeImage.createFromPath(path.join(__dirname, "../src/assets/icon.png")));

    const contextMenu = Menu.buildFromTemplate([
      {
        label: "显示主窗口",
        click: () => {
          let win = this.getWindow('home')
          if (win) {
            win.show()
            win.restore()
            win.center()
            win.focus()
          }
        },
      },
      {
        label: "退出",
        click: () => {
          this.closeAllWindows()
        },
      },
    ]);

    this.tray.on('click', () => {
      let win = this.getWindow('home')
      if (win) {
        win.show()
        win.restore()
        win.center()
        win.focus()
      }
    })
    this.tray.setToolTip(app.getName());
    this.tray.setContextMenu(contextMenu);
  }

  public CreateWindow(config: any) {
    let wc: WindowConfig | undefined = configs.get(config.key)
    if (wc?.key == 'home') {
      this.createTray()
    }
    if (wc) {
      if (config.data !== undefined) {
        wc.data = {
          ...wc.data,
          ...config.data,
        }
      }
      if (wc.parentId !== undefined) {
        this.windows.forEach(w => {
          if (w.key === wc.parentId) {
            wc.parent = w.window
          }
        })
      }
      this.createWindow(wc)
    } else {
      console.log('createWindow:invail key')
    }
  }

  private createWindow(config: WindowConfig) {
    const {
      key,
      url,
      data,
      width = 1200,
      height = 800,
      minWidth = 400,
      minHeight = 300,
      resizable = true,
      modal = false,
      frame = true,
      parent,
      webPreferences = {},
    } = config;

    // 检查是否已存在相同key的窗口
    if (this.windows.has(key)) {
      const existingWindow = this.windows.get(key)!.window;
      existingWindow.focus();
      return existingWindow;
    }

    // 创建窗口
    const window = new BrowserWindow({
      width,
      height,
      minWidth,
      minHeight,
      resizable,
      frame,
      icon: path.join(__dirname, '../src/assets/icon.png'),
      modal,
      title: app.getName(),
      parent: parent,
      show: false,
      webPreferences: {
        ...webPreferences,
        // 使用 ESM 版本的预加载脚本，确保暴露 once/removeAllListeners 等方法
        preload: path.join(__dirname, 'preload.mjs'),
      },
    });

    window.webContents.on('did-finish-load', () => {
      window.show()
      window.center()
    })

    // 监听窗口状态变化并通过 IPC 通知渲染进程
    window.on('maximize', () => {
      if (!window.isDestroyed()) {
        window.webContents.send('window:state', 'maximized')
      }
    })

    window.on('unmaximize', () => {
      if (!window.isDestroyed()) {
        window.webContents.send('window:state', 'unmaximize')
      }
    })
    // 拦截链接打开
    // window.webContents.setWindowOpenHandler((details) => {
    //   const child = new BrowserWindow({
    //     width: 800,
    //     height: 600,
    //     parent: mainWindow,   // 让它成为子窗口
    //     modal: false,
    //     webPreferences: {
    //       nodeIntegration: true,
    //       contextIsolation: false,
    //     },
    //   });
    //   return { action: 'deny' } // 阻止 Electron 默认行为
    // })

    // 记录窗口
    this.windows.set(key, {
      key,
      window,
      url,
      data,
    });

    // 窗口关闭时清理
    window.on('closed', () => {
      this.windows.delete(key);
    });

    // 加载URL

    const baseUrl = process.env['VITE_DEV_SERVER_URL'] ? process.env['VITE_DEV_SERVER_URL'] :
      path.join(__dirname, '../index.html')
    if (process.env['VITE_DEV_SERVER_URL']) {
      window.loadURL(baseUrl + '/#' + url);
    } else {
      window.loadFile(baseUrl, { hash: url });
    }
  }

  /**
   * 获取窗口
   */
  public getWindow(key: string): BrowserWindow | null {
    return this.windows.get(key)?.window || null;
  }

  public closeAllWindows(): void {
    this.windows.forEach((managed) => {
      if (!managed.window.isDestroyed() && managed.key === 'home') {
        managed.window.webContents.send('app-quit')
      }
    });
    this.windows.clear();
    app.quit()
  }

  /**
   * 获取窗口列表
   */
  public getWindowList(): string[] {
    return Array.from(this.windows.keys());
  }

  /**
   * 检查窗口是否存在
   */
  public hasWindow(key: string): boolean {
    return this.windows.has(key);
  }

  /**
   * 向窗口发送消息
   */
  public sendMessage(key: string, channel: string, data?: any): void {
    const window = this.getWindow(key);
    if (window && !window.isDestroyed()) {
      window.webContents.send(channel, data);
    }
  }

  /**
   * 向所有窗口发送消息
   */
  public broadcastMessage(channel: string, data?: any): void {
    this.windows.forEach((managed) => {
      if (!managed.window.isDestroyed()) {
        managed.window.webContents.send(channel, data);
      }
    });
  }
  /**
   * 获取窗口数据
   */
  public getWindowData(key: string): Record<string, any> | undefined {
    return this.windows.get(key)?.data;
  }

  /**
   * 聚焦窗口
   */
  public focusWindow(key: string): void {
    const window = this.getWindow(key);
    if (window && !window.isDestroyed()) {
      if (window.isMinimized()) {
        window.restore();
      }
      window.focus();
    }
  }

  /**
   * 显示窗口
   */
  public showWindow(key: string): void {
    const window = this.getWindow(key);
    if (window && !window.isDestroyed()) {
      window.show();
    }
  }
  /**
   * 设置IPC处理器
   */
  private setupIpcHandlers(): void {
    // 从渲染进程获取窗口初始数据
    ipcMain.on('window:get-init-data', (event) => {
      const sender = BrowserWindow.fromWebContents(event.sender)
      this.windows.forEach(w => {
        if (w.window === sender) {
          sender.webContents.send('init-data', w.data)
        }
      })
    });

    ipcMain.on('window:new-window', (e, config) => {
      this.CreateWindow(config)
    })

    // 最小化窗口
    ipcMain.on('window:minimize', (event: IpcMainEvent) => {
      const sender = BrowserWindow.fromWebContents(event.sender)
      this.windows.forEach(w => {
        if (w.window && !w.window.isDestroyed() && w.window === sender) {
          w.window.minimize();
        }
      })
    });

    // 最大化窗口
    ipcMain.on('window:maximize', (event: IpcMainEvent) => {
      const sender = BrowserWindow.fromWebContents(event.sender)
      this.windows.forEach(w => {
        if (w.window && !w.window.isDestroyed() && w.window === sender) {
          if (w.window.isMaximized()) {
            w.window.unmaximize();
          } else {
            w.window.maximize();
          }
        }
      })
    });

    // 隐藏窗口
    ipcMain.on('window:hide', (event: IpcMainEvent) => {
      const sender = BrowserWindow.fromWebContents(event.sender)
      this.windows.forEach(w => {
        if (w.window && !w.window.isDestroyed() && w.window === sender) {
          w.window.hide();
          console.log('hide window', w.key)
        }
      })
    });

    // 显示窗口
    ipcMain.on('window:show', (event: IpcMainEvent, key: string) => {
      this.showWindow(key);
    });

    // 向主进程发送消息
    ipcMain.on('window:send-to', (event: IpcMainEvent, { key, channel, data }) => {
      this.sendMessage(key, channel, data);
    });

    ipcMain.on('window:publish', (event: IpcMainEvent, { channel, data }) => {
      this.broadcastMessage(channel, data);
    });
  }
}

export const windowManager = new WindowManager();
export default WindowManager;