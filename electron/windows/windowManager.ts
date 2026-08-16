import { BrowserWindow, app, screen } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WindowConfig, ManagedWindow, CreateWindowRequest, WindowState } from './windowAttribute';
import configs from './windowAttribute';
import { TrayManager } from './trayManager';
import { TrayMenuWindow } from './trayMenuWindow';
import { setupWindowIpcHandlers } from './ipcHandlers';
import { IpcChannels, TrayMenuAction, TrayMenuSize } from '@shared/types';
import { Main_Config as config } from '@shared/config/constants';
import { WindowKey } from '@shared/config/windowKeys';
import { closeAllDb } from '@/electron/db';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class WindowManager {
  private windows: Map<WindowKey, ManagedWindow> = new Map();
  private trayManager: TrayManager | null = null;
  // Map of webContentsId -> showWindow callback for pending ready signals
  private pendingReadyWindows: Map<number, () => void> = new Map();
  /** 托盘右键菜单弹层，窗口的创建/定位/显隐都在里面自成一套 */
  private trayMenu = new TrayMenuWindow(this);

  constructor() {
    setupWindowIpcHandlers(this);
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
      if (wc.key === WindowKey.Home) {
        if (!this.trayManager) {
          this.trayManager = new TrayManager({
            onShowHome: () => this.showWindow(WindowKey.Home),
            onOpenSettings: () => {
              this.CreateWindow({ key: WindowKey.Settings });
            },
            onOpenMenu: (anchor) => this.trayMenu.show(anchor),
            onQuit: () => {
              this.closeAllWindows().finally(() => {
                // 等 DB Worker 队列中的写入（含退出前的会话保存）落盘后再退出
                closeAllDb()
                  .catch((err) => console.error('[WindowManager] closeAllDb on quit failed:', err))
                  .finally(() => app.quit());
              });
            }
          });
        }
        this.trayManager.createTray();
        this.trayMenu.prepare();
      }

      // 合并 windowSize 到 wc（优先使用调用方传入的尺寸）
      if (config.windowSize) {
        wc.width = config.windowSize.width;
        wc.height = config.windowSize.height;
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
  public isValidWindow(window: BrowserWindow | null): boolean {
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
        skipTaskbar = false,
        alwaysOnTop = false,
        hasShadow = true,
        webPreferences = {},
      } = config;

      // 检查是否已存在相同key的窗口
      const existingWindow = this.getWindow(key);
      if (this.isValidWindow(existingWindow)) {
        existingWindow!.focus();
        return existingWindow;
      }

      const bounds = this.getSafeWindowBounds(undefined, defaultWidth, defaultHeight);

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
        backgroundMaterial,
        transparent,
        skipTaskbar,
        alwaysOnTop,
        hasShadow,
        opacity: 1,
        icon: path.join(process.env.VITE_PUBLIC || __dirname, 'icon/icon_' + process.env.VITE_ICON_VERSION + '.png'),
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
      const cleanup = this.setupWindowListeners(window, config);

      // 记录窗口
      this.windows.set(key, {
        key,
        window,
        url,
        data,
        cleanup,
      });


      // 如果是开发环境，以独立窗口打开调试工具（显式关掉 devTools 的窗口除外，如托盘菜单弹层）
      if (process.env['VITE_DEV_SERVER_URL'] && webPreferences.devTools !== false) {
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
    windowConfig: WindowConfig
  ): () => void {
    const key = windowConfig.key;
    const resizable = windowConfig.resizable !== false;
    // 在窗口销毁前保存 webContents.id
    const webContentsId = window.webContents.id;

    // 配置 show: false 表示静默创建（如托盘菜单弹层）：页面加载完也不自动显示，
    // 由业务在合适的时机（右键托盘）自行定位并 show
    const autoShowOnReady = windowConfig.show !== false;

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
      // 弹层类窗口（center: false）的位置由调用方按锚点算好，居中会把它挪走
      if (windowConfig.center !== false && !window.isMaximized()) {
        window.center();
      }
    };

    // 注册到 pendingReadyWindows，等待 window:ready 信号
    if (autoShowOnReady) {
      this.pendingReadyWindows.set(webContentsId, showWindow);
    }

    // 窗口加载完成 - 启动超时计时器
    const onDidFinishLoad = () => {
      if (autoShowOnReady && this.isValidWindow(window) && !isShown) {
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
        window.webContents.send(IpcChannels.WINDOW_STATE, 'maximized');
        if (windowConfig.hooks?.onMaximize) {
          try { windowConfig.hooks.onMaximize(window); } catch (e) { console.error(e); }
        }
      }
    };

    const onUnmaximize = () => {
      if (this.isValidWindow(window)) {
        window.webContents.send(IpcChannels.WINDOW_STATE, 'unmaximize');
      }
    };

    const onMinimize = () => {
      if (this.isValidWindow(window)) {
        window.webContents.send(IpcChannels.WINDOW_STATE, 'minimized');
        if (windowConfig.hooks?.onMinimize) {
          try { windowConfig.hooks.onMinimize(window); } catch (e) { console.error(e); }
        }
      }
    };

    const onRestore = () => {
      if (this.isValidWindow(window)) {
        window.webContents.send(IpcChannels.WINDOW_STATE, 'restored');
        if (windowConfig.hooks?.onRestore) {
          try { windowConfig.hooks.onRestore(window); } catch (e) { console.error(e); }
        }
      }
    };

    const onFocus = () => {
      if (this.isValidWindow(window)) {
        window.webContents.send(IpcChannels.WINDOW_STATE, 'focused');
        window.flashFrame(false);
        if (windowConfig.hooks?.onFocus) {
          try { windowConfig.hooks.onFocus(window); } catch (e) { console.error(e); }
        }
      }
    };

    const onBlur = () => {
      if (this.isValidWindow(window) && windowConfig.hooks?.onBlur) {
        try { windowConfig.hooks.onBlur(window); } catch (e) { console.error(e); }
      }
    };

    // 窗口将要关闭时（window 还未销毁）
    const onClose = (e: Electron.Event) => {
      // 调用配置钩子（例如保存窗口状态）
      if (windowConfig.hooks?.onClose && this.isValidWindow(window)) {
        e.preventDefault()
        try { windowConfig.hooks.onClose(window, e); } catch (err) { console.error(err); }
      }
    };

    // 窗口真正关闭时清理
    const onClosed = () => {
      if (readyTimeout) {
        clearTimeout(readyTimeout);
      }
      this.pendingReadyWindows.delete(webContentsId);
      this.windows.delete(key);
      // 调用配置钩子
      if (windowConfig.hooks?.onClosed) {
        try { windowConfig.hooks.onClosed(this); } catch (e) { console.error(e); }
      }
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
    window.on('close', onClose);
    window.on('closed', onClosed);
    window.on('focus', onFocus);
    window.on('blur', onBlur);
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
      window.removeListener('close', onClose);
      window.removeListener('closed', onClosed);
      window.removeListener('focus', onFocus);
      window.removeListener('blur', onBlur);
    };
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
  public getWindow(key: WindowKey): BrowserWindow | null {
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

    // 收集需要关闭的窗口
    const windowsToClose: ManagedWindow[] = [];
    this.windows.forEach((managed) => {
      if (this.isValidWindow(managed.window)) {
        windowsToClose.push(managed);
      }
    });

    // 先解除常驻监听，再发送退出信号
    const closePromises = windowsToClose.map((managed) => {
      return new Promise<void>((resolve) => {
        // 提前移除常驻监听（含 home 窗口 close→隐藏到托盘的拦截）：
        // 否则渲染进程收到 APP_QUIT 后调用的 window.close() 会被 preventDefault
        // 拦下，只能等超时强制 destroy，退出被无谓拖长
        if (managed.cleanup) {
          try {
            managed.cleanup();
          } catch (error) {
            console.error(`Failed to cleanup window "${managed.key}":`, error);
          }
        }

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

    // 等待所有窗口完成落盘并关闭，最多 10 秒（渲染进程正常保存仅需数十毫秒）
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

      Promise.all(closePromises).then(() => {
        clearTimeout(timeout);
        this.windows.clear();
        this.trayManager?.destroy();
        this.trayManager = null;
        this.trayMenu.reset();
        resolve();
      });
    })
  }

  /**
   * 向窗口发送消息（带错误处理）
   */
  public sendMessage(key: WindowKey, channel: string, data?: any): boolean {
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
  public showWindow(key: WindowKey): boolean {
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
   * 托盘菜单弹层：渲染层上报测量尺寸
   */
  public handleTrayMenuReady(size: TrayMenuSize): void {
    this.trayMenu.handleReady(size);
  }

  /**
   * 托盘菜单弹层：执行菜单项（先收起弹层，避免动作弹出的新窗口被菜单挡住）
   */
  public runTrayMenuAction(action: TrayMenuAction): void {
    this.trayMenu.hide();
    this.trayManager?.runMenuAction(action);
  }

  /**
   * 托盘菜单弹层：收起
   */
  public hideTrayMenu(): void {
    this.trayMenu.hide();
  }

  /**
   * 窗口渲染层就绪：显示等待中的窗口（静默创建的窗口不在等待表里，不受影响）
   */
  public notifyWindowReady(webContentsId: number): void {
    const showWindow = this.pendingReadyWindows.get(webContentsId);
    if (showWindow) {
      showWindow();
    }
  }
}

export const windowManager = new WindowManager();
export default WindowManager;