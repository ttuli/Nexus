import { BrowserWindow, ipcMain, IpcMainEvent, app, screen } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WindowConfig, ManagedWindow, CreateWindowRequest, WindowState } from './windowAttribute';
import configs from './windowAttribute';
import { windowStateManager } from '../utils/windowState';
import { resourceManager } from '../resource';
import { TrayManager } from './trayManager';
import { IpcChannels } from '../../src/types';
import { config } from '../config';
import { restoreWindowDecorations } from '../utils/acrylicBlur';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class WindowManager {
  private windows: Map<string, ManagedWindow> = new Map();
  private trayManager: TrayManager | null = null;
  // Map of webContentsId -> showWindow callback for pending ready signals
  private pendingReadyWindows: Map<number, () => void> = new Map();

  constructor() {
    this.setupIpcHandlers();
  }

  /**
   * 创建窗口（类型安全版本）
   */
  public CreateWindow(config: CreateWindowRequest): void {
    try {
      const wc: WindowConfig | undefined = configs.get(config.key);

      if (!wc) {
        console.error(`Invalid window key: ${config.key}`);
        return;
      }

      // 如果是 home 窗口，创建托盘
      if (wc.key === 'home') {
        if (!this.trayManager) {
          this.trayManager = new TrayManager({
            onShowHome: () => this.showWindow('home'),
            onOpenSettings: () => {
              this.showWindow('home');
              setTimeout(() => {
                this.sendMessage('home', IpcChannels.ROUTE_NAVIGATE, '/home/settings');
              }, 200);
            },
            onQuit: () => {
              this.closeAllWindows().finally(() => {
                app.quit();
              });
            }
          });
        }
        this.trayManager.createTray();
      }

      // 合并数据
      if (config.data !== undefined) {
        wc.data = {
          ...wc.data,
          ...config.data,
        };
      }

      // 查找父窗口（优化：直接查找而不是遍历所有窗口）
      if (wc.parentId !== undefined) {
        const parentWindow = this.getWindow(wc.parentId);
        if (parentWindow && !parentWindow.isDestroyed()) {
          wc.parent = parentWindow;
        } else {
          console.warn(`Parent window "${wc.parentId}" not found or destroyed`);
        }
      }
      this.createWindow(wc);
    } catch (error) {
      console.error(`Failed to create window "${config.key}":`, error);
    }
  }

  /**
   * 检查窗口是否有效
   */
  private isValidWindow(window: BrowserWindow | null): boolean {
    return window !== null && !window.isDestroyed();
  }

  /**
   * 计算安全的窗口位置（确保窗口在屏幕可见区域内）
   */
  private getSafeWindowBounds(
    savedState: WindowState | undefined,
    defaultWidth: number,
    defaultHeight: number
  ): { x: number; y: number; width: number; height: number } {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
    const { x: screenX, y: screenY } = primaryDisplay.workArea;

    let x = screenX + (screenWidth - defaultWidth) / 2;
    let y = screenY + (screenHeight - defaultHeight) / 2;
    let width = defaultWidth;
    let height = defaultHeight;

    if (savedState) {
      width = savedState.width || defaultWidth;
      height = savedState.height || defaultHeight;
      x = savedState.x ?? x;
      y = savedState.y ?? y;
    }

    // 确保窗口在屏幕可见区域内
    const maxX = screenX + screenWidth - Math.min(width, 200);
    const maxY = screenY + screenHeight - Math.min(height, 200);
    x = Math.max(screenX, Math.min(x, maxX));
    y = Math.max(screenY, Math.min(y, maxY));

    return { x, y, width, height };
  }

  /**
   * 创建窗口
   */
  private createWindow(config: WindowConfig): BrowserWindow | null {
    try {
      let {
        key,
        url,
        data,
        width: defaultWidth = 1200,
        height: defaultHeight = 800,
        minWidth = 400,
        minHeight = 300,
        resizable = true,
        maximizable = true,
        modal = false,
        frame = true,
        parent,
        transparent = false,
        backgroundColor = '#00000000',
        backgroundMaterial,
        webPreferences = {},
      } = config;

      // 检查是否已存在相同key的窗口
      const existingWindow = this.getWindow(key);
      if (this.isValidWindow(existingWindow)) {
        existingWindow!.focus();
        return existingWindow;
      }

      // 加载保存的窗口状态
      const savedState = windowStateManager.getState(key);
      // const savedState = undefined;
      const bounds = this.getSafeWindowBounds(savedState, defaultWidth, defaultHeight);

      // 创建窗口
      const window = new BrowserWindow({
        width: bounds.width,
        height: bounds.height,
        x: bounds.x,
        y: bounds.y,
        minWidth,
        minHeight,
        resizable,
        maximizable,
        frame,
        backgroundColor,
        transparent,
        backgroundMaterial,
        opacity: 1,
        icon: path.join(process.env.VITE_PUBLIC || __dirname, 'icon.png'),
        modal,
        title: app.getName(),
        parent: parent,
        show: false,
        webPreferences: {
          ...webPreferences,
          contextIsolation: true,
          nodeIntegration: false,
          preload: path.join(__dirname, 'preload.mjs'),
        },
      });

      // 设置事件监听器
      const cleanup = this.setupWindowListeners(window, key, resizable);

      // 记录窗口
      this.windows.set(key, {
        key,
        window,
        url,
        data,
        cleanup,
      });


      // 监听渲染进程的控制台输出（便于调试）
      // window.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      //   const levelName = ['log', 'warn', 'error'][level] || 'info';
      //   console.log(`[Renderer:${key}] [${levelName}] ${message} (${sourceId}:${line})`);
      // });

      // 如果是开发环境，以独立窗口打开调试工具
      if (process.env['VITE_DEV_SERVER_URL']) {
        const devtools = new BrowserWindow({
          width: 1000,
          height: 800,
          show: true,
        });
        window.on('closed', () => {
          if (devtools.isDestroyed()) return;
          devtools.close();
        })
        window.webContents.setDevToolsWebContents(devtools.webContents)
        window.webContents.openDevTools({ mode: 'detach' });
      }

      // 加载页面（将 data 作为 query 参数传递）
      this.loadWindowContent(window, url, data);
      return window;
    } catch (error) {
      console.error(`Failed to create window "${config.key}":`, error);
      return null;
    }
  }

  /**
   * 设置窗口事件监听器
   */
  private setupWindowListeners(
    window: BrowserWindow,
    key: string,
    resizable: boolean
  ): () => void {
    // 在窗口销毁前保存 webContents.id
    const webContentsId = window.webContents.id;

    // 窗口是否已显示的标志
    let isShown = false;
    let readyTimeout: NodeJS.Timeout | null = null;

    // 显示窗口的辅助函数
    const showWindow = () => {
      if (isShown || !this.isValidWindow(window)) return;
      isShown = true;
      if (readyTimeout) {
        clearTimeout(readyTimeout);
        readyTimeout = null;
      }
      this.pendingReadyWindows.delete(webContentsId);
      window.show();
      if (!window.isMaximized()) {
        window.center();
      }
    };

    // 注册到 pendingReadyWindows，等待 window:ready 信号
    this.pendingReadyWindows.set(webContentsId, showWindow);

    // 窗口加载完成 - 启动超时计时器
    const onDidFinishLoad = () => {
      if (this.isValidWindow(window) && !isShown) {
        // 设置超时保护：3秒后如果还没收到 ready 信号，强制显示
        readyTimeout = setTimeout(() => {
          console.warn(`Window "${key}" ready timeout, forcing show`);
          showWindow();
        }, config.windowConfig.showTimeoutMs);
      }
    };

    // 窗口状态变化监听
    const onMaximize = () => {
      if (this.isValidWindow(window) && resizable) {
        if (key === 'home') {
          // 最大化时替换底色为亮灰色（或替换为您想要的其他十六进制颜色，如 #FFFFFF）
          window.setBackgroundColor('#f3f3f3');
        }
        window.webContents.send(IpcChannels.WINDOW_STATE, 'maximized');
      }
    };

    const onUnmaximize = () => {
      if (this.isValidWindow(window)) {
        if (key === 'home') {
          window.setBackgroundColor('#00000000');
        }
        window.webContents.send(IpcChannels.WINDOW_STATE, 'unmaximize');
        restoreWindowDecorations(window);
      }
    };

    const onMinimize = () => {
      if (this.isValidWindow(window)) {
        window.webContents.send(IpcChannels.WINDOW_STATE, 'minimized');
      }
    };

    const onRestore = () => {
      if (this.isValidWindow(window)) {
        if (key === 'home') {
          window.setBackgroundColor('#00000000');
        }
        window.webContents.send(IpcChannels.WINDOW_STATE, 'restored');
        restoreWindowDecorations(window);
      }
    };

    const onFocus = () => {
      if (this.isValidWindow(window)) {
        window.webContents.send(IpcChannels.WINDOW_STATE, 'focused');
        window.flashFrame(false);
      }
    };

    // 窗口真正关闭时清理
    const onClosed = () => {
      if (readyTimeout) {
        clearTimeout(readyTimeout);
      }
      this.pendingReadyWindows.delete(webContentsId);
      this.windows.delete(key);
    };

    // 页面加载错误处理
    const onDidFailLoad = (_event: Electron.Event, errorCode: number, errorDescription: string) => {
      console.error(`Window "${key}" failed to load:`, errorCode, errorDescription);
      if (this.isValidWindow(window)) {
        window.webContents.send(IpcChannels.WINDOW_LOAD_ERROR, { errorCode, errorDescription });
      }
    };

    // 注册所有监听器
    window.webContents.on('did-finish-load', onDidFinishLoad);
    window.on('maximize', onMaximize);
    window.on('unmaximize', onUnmaximize);
    window.on('minimize', onMinimize);
    window.on('restore', onRestore);
    window.on('closed', onClosed);
    window.on('focus', onFocus);
    window.webContents.on('did-fail-load', onDidFailLoad);

    // 返回清理函数
    return () => {
      if (readyTimeout) {
        clearTimeout(readyTimeout);
      }
      this.pendingReadyWindows.delete(webContentsId);
      if (this.isValidWindow(window)) {
        window.webContents.removeListener('did-finish-load', onDidFinishLoad);
        window.webContents.removeListener('did-fail-load', onDidFailLoad);
      }
      window.removeListener('maximize', onMaximize);
      window.removeListener('unmaximize', onUnmaximize);
      window.removeListener('minimize', onMinimize);
      window.removeListener('restore', onRestore);
      window.removeListener('closed', onClosed);
      window.removeListener('focus', onFocus);
    };
  }

  /**
   * 保存窗口状态
   */
  private saveWindowState(key: string, window: BrowserWindow): void {
    if (!this.isValidWindow(window)) return;

    try {
      const bounds = window.getBounds();
      const state: WindowState = {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        isMaximized: window.isMaximized(),
        isMinimized: window.isMinimized(),
      };
      windowStateManager.saveState(key, state);
    } catch (error) {
      console.error(`Failed to save window state for "${key}":`, error);
    }
  }

  /**
   * 加载窗口内容
   */
  private loadWindowContent(window: BrowserWindow, url: string, data?: Record<string, any>): void {
    try {
      const baseUrl = process.env['VITE_DEV_SERVER_URL']
        ? process.env['VITE_DEV_SERVER_URL']
        : path.join(__dirname, '../index.html');

      // Build query string from data
      let queryString = '';
      if (data && Object.keys(data).length > 0) {
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(data)) {
          // Serialize objects/arrays as JSON
          if (typeof value === 'object') {
            params.append(key, JSON.stringify(value));
          } else {
            params.append(key, String(value));
          }
        }
        queryString = '?' + params.toString();
      }

      if (process.env['VITE_DEV_SERVER_URL']) {
        const fullUrl = baseUrl + '/#' + url + queryString;
        window.loadURL(fullUrl).catch((error) => {
          console.error('Failed to load URL:', error);
        });
      } else {
        // For production, hash includes both path and query
        window.loadFile(baseUrl, { hash: url + queryString }).catch((error) => {
          console.error('Failed to load file:', error);
        });
      }
    } catch (error) {
      console.error('Failed to load window content:', error);
    }
  }

  /**
   * 获取窗口（带状态检查）
   */
  public getWindow(key: string): BrowserWindow | null {
    const managed = this.windows.get(key);
    if (managed && this.isValidWindow(managed.window)) {
      return managed.window;
    }
    // 如果窗口已销毁，清理记录
    if (managed) {
      this.windows.delete(key);
    }
    return null;
  }

  /**
   * 关闭所有窗口（真正退出应用）
   */
  public closeAllWindows(): Promise<void> {

    // 先调用退出登录 API（此时 token 还存在）
    const logoutPromise = resourceManager.callLogoutApi();

    // 收集需要关闭的窗口
    const windowsToClose: ManagedWindow[] = [];
    this.windows.forEach((managed) => {
      if (this.isValidWindow(managed.window)) {
        windowsToClose.push(managed);
      }
    });

    // 先绑定 close 事件，再发送退出信号并清理
    const closePromises = windowsToClose.map((managed) => {
      return new Promise<void>((resolve) => {
        // 在窗口关闭前保存状态和执行清理（此时窗口还未销毁）
        managed.window.once('close', () => {
          if (managed.key === 'home') {
            this.saveWindowState(managed.key, managed.window);
          }
          // 在窗口销毁前执行清理
          if (managed.cleanup) {
            try {
              managed.cleanup();
            } catch (error) {
              console.error(`Failed to cleanup window "${managed.key}":`, error);
            }
          }
        });

        // 窗口销毁后 resolve
        managed.window.once('closed', () => {
          resolve();
        });

        // 发送退出信号
        try {
          managed.window.webContents.send(IpcChannels.APP_QUIT);
        } catch (error) {
          console.error(`Failed to send quit signal to window "${managed.key}":`, error);
        }

      });
    });

    // 等待所有窗口关闭和退出登录 API 完成，最多 3 秒
    return new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        // 超时后强制销毁未关闭的窗口
        windowsToClose.forEach((managed) => {
          if (this.isValidWindow(managed.window)) {
            console.warn(`Window "${managed.key}" did not close in time, forcing destroy`);
            managed.window.destroy();
          }
        });
        resolve();
      }, 10000);

      Promise.all([...closePromises, logoutPromise]).then(() => {
        clearTimeout(timeout);
        resourceManager.cleanout();
        this.windows.clear();
        this.trayManager?.destroy();
        this.trayManager = null;
        resolve();
      });
    })
  }

  /**
   * 向窗口发送消息（带错误处理）
   */
  public sendMessage(key: string, channel: string, data?: any): boolean {
    const window = this.getWindow(key);
    if (window) {
      try {
        window.webContents.send(channel, data);
        return true;
      } catch (error) {
        console.error(`Failed to send message to window "${key}":`, error);
        return false;
      }
    }
    return false;
  }

  /**
   * 广播消息到所有窗口（带错误处理）
   */
  public broadcastMessage(channel: string, data?: any): void {
    this.windows.forEach((managed) => {
      if (this.isValidWindow(managed.window)) {
        try {
          managed.window.webContents.send(channel, data);
        } catch (error) {
          console.error(`Failed to broadcast to window "${managed.key}":`, error);
        }
      }
    });
  }

  /**
   * 显示窗口
   */
  public showWindow(key: string): boolean {
    const window = this.getWindow(key);
    if (window) {
      try {
        window.show();
        window.focus();
        if (window.isMinimized()) {
          window.restore();
        }
        return true;
      } catch (error) {
        console.error(`Failed to show window "${key}":`, error);
        return false;
      }
    }
    return false;
  }
  /**
   * 设置IPC处理器
   */
  private setupIpcHandlers(): void {
    // 创建新窗口
    ipcMain.on(IpcChannels.WINDOW_NEW, (_e: IpcMainEvent, config: CreateWindowRequest) => {
      this.CreateWindow(config);
    });

    // 最小化窗口
    ipcMain.on(IpcChannels.WINDOW_MINIMIZE, (event: IpcMainEvent) => {
      try {
        const sender = BrowserWindow.fromWebContents(event.sender);
        if (sender && this.isValidWindow(sender)) {
          sender.minimize();
        }
      } catch (error) {
        console.error('Failed to minimize window:', error);
      }
    });

    // 最大化/还原窗口
    ipcMain.on(IpcChannels.WINDOW_MAXIMIZE, (event: IpcMainEvent) => {
      try {
        const sender = BrowserWindow.fromWebContents(event.sender);
        if (sender && this.isValidWindow(sender)) {
          if (sender.isMaximized()) {
            sender.unmaximize();
          } else {
            sender.maximize();
          }
        }
      } catch (error) {
        console.error('Failed to maximize/unmaximize window:', error);
      }
    });

    // 隐藏窗口（最小化到托盘）
    ipcMain.on(IpcChannels.WINDOW_HIDE, (event: IpcMainEvent) => {
      try {
        const sender = BrowserWindow.fromWebContents(event.sender);
        if (sender && this.isValidWindow(sender)) {
          sender.hide();
        }
      } catch (error) {
        console.error('Failed to hide window:', error);
      }
    });

    // 显示窗口
    ipcMain.on(IpcChannels.WINDOW_SHOW, (_event: IpcMainEvent, key: string) => {
      this.showWindow(key);
    });

    // 向指定窗口发送消息
    ipcMain.on(IpcChannels.WINDOW_SEND_TO, (_event: IpcMainEvent, { key, channel, data }: { key: string; channel: string; data?: any }) => {
      this.sendMessage(key, channel, data);
    });

    // 广播消息到所有窗口
    ipcMain.on(IpcChannels.WINDOW_PUBLISH, (_event: IpcMainEvent, { channel, data }: { channel: string; data?: any }) => {
      this.broadcastMessage(channel, data);
    });

    // 窗口 ready 信号（统一处理所有窗口）
    ipcMain.on(IpcChannels.WINDOW_READY, (event: IpcMainEvent) => {
      const webContentsId = event.sender.id;
      const showWindow = this.pendingReadyWindows.get(webContentsId);
      if (showWindow) {
        showWindow();
      }
    });

    // 检查窗口是否焦点状态 (invoke)
    ipcMain.handle(IpcChannels.WINDOW_IS_FOCUSED, (event) => {
      try {
        const sender = BrowserWindow.fromWebContents(event.sender);
        return sender !== null && this.isValidWindow(sender) && sender.isFocused();
      } catch (error) {
        console.error('Failed to get window focused state:', error);
        return false;
      }
    });

    // 任务栏闪烁
    ipcMain.on(IpcChannels.WINDOW_FLASH_FRAME, (event) => {
      try {
        const sender = BrowserWindow.fromWebContents(event.sender);
        if (sender && this.isValidWindow(sender)) {
          // 任务栏闪烁 (如果窗口未聚焦)
          if (!sender.isFocused()) {
            sender.flashFrame(true);
          }
        }
      } catch (error) {
        console.error('Failed to handle flash frame request:', error);
      }
    });
  }
}

export const windowManager = new WindowManager();
export default WindowManager;