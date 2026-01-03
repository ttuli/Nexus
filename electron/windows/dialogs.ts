import { BrowserWindow, ipcMain, IpcMainEvent, Tray, Menu, nativeImage, app, screen } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WindowConfig, ManagedWindow, CreateWindowRequest, WindowState } from './windowAttribute';
import configs from './windowAttribute';
import { windowStateManager } from '../utils/windowState';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class WindowManager {
  private windows: Map<string, ManagedWindow> = new Map();
  private tray: Tray | null = null;
  private requireQuit: boolean = false;

  constructor() {
    this.setupIpcHandlers();
  }

  public isRequireQuit(): boolean {
    return this.requireQuit
  }

  private createTray(): void {
    try {
      const iconPath = path.join(__dirname, '../src/assets/icon.png');
      const icon = nativeImage.createFromPath(iconPath);
      
      if (icon.isEmpty()) {
        console.error('Failed to load tray icon from:', iconPath);
        return;
      }

      this.tray = new Tray(icon);
      
      const contextMenu = Menu.buildFromTemplate([
        {
          label: '显示主窗口',
          click: () => {
            this.showWindow('home');
          },
        },
        {
          type: 'separator',
        },
        {
          label: '退出',
          click: () => {
            this.closeAllWindows();
          },
        },
      ]);

      // 托盘图标点击事件
      this.tray.on('click', () => {
        this.showWindow('home');
      });

      // 托盘图标右键菜单
      this.tray.setContextMenu(contextMenu);
      this.tray.setToolTip(app.getName());
    } catch (error) {
      console.error('Failed to create tray:', error);
    }
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
        this.createTray();
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
      const {
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
        allowHideOnClose = false,
        webPreferences = {},
      } = config;

      // 检查是否已存在相同key的窗口
      const existingWindow = this.getWindow(key);
      if (this.isValidWindow(existingWindow)) {
        existingWindow!.focus();
        return existingWindow;
      }

      // 加载保存的窗口状态
      // const savedState = windowStateManager.getState(key);
      const savedState = undefined;
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
        icon: path.join(__dirname, '../src/assets/icon.png'),
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
      const cleanup = this.setupWindowListeners(window, key, resizable, allowHideOnClose);

      // 记录窗口
      this.windows.set(key, {
        key,
        window,
        url,
        data,
        cleanup,
      });

      // 加载页面
      this.loadWindowContent(window, url);

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
    resizable: boolean,
    allowHideOnClose: boolean
  ): () => void {
    // 窗口加载完成
    const onDidFinishLoad = () => {
      if (this.isValidWindow(window)) {
        window.show();
        if (!window.isMaximized()) {
          window.center();
        }
      }
    };

    // 窗口状态变化监听
    const onMaximize = () => {
      if (this.isValidWindow(window) && resizable) {
        window.webContents.send('window:state', 'maximized');
        this.saveWindowState(key, window);
      }
    };

    const onUnmaximize = () => {
      if (this.isValidWindow(window)) {
        window.webContents.send('window:state', 'unmaximize');
        this.saveWindowState(key, window);
      }
    };

    const onMinimize = () => {
      if (this.isValidWindow(window)) {
        window.webContents.send('window:state', 'minimized');
      }
    };

    const onRestore = () => {
      if (this.isValidWindow(window)) {
        window.webContents.send('window:state', 'restored');
      }
    };

    const onResize = () => {
      if (this.isValidWindow(window) && !window.isMaximized()) {
        this.saveWindowState(key, window);
      }
    };

    // 窗口关闭事件（根据配置决定是隐藏还是真正关闭）
    const onClose = (event: Electron.Event) => {
      if (allowHideOnClose && key === 'home') {
        // 主窗口关闭时隐藏到托盘
        event.preventDefault();
        window.hide();
      } else {
        // 其他窗口或明确要求关闭时，真正关闭
        this.saveWindowState(key, window);
      }
    };

    // 窗口真正关闭时清理
    const onClosed = () => {
      this.windows.delete(key);
      windowStateManager.deleteState(key);
    };

    // 页面加载错误处理
    const onDidFailLoad = (event: Electron.Event, errorCode: number, errorDescription: string) => {
      console.error(`Window "${key}" failed to load:`, errorCode, errorDescription);
      if (this.isValidWindow(window)) {
        window.webContents.send('window:load-error', { errorCode, errorDescription });
      }
    };

    // 注册所有监听器
    window.webContents.on('did-finish-load', onDidFinishLoad);
    window.on('maximize', onMaximize);
    window.on('unmaximize', onUnmaximize);
    window.on('minimize', onMinimize);
    window.on('restore', onRestore);
    window.on('resize', onResize);
    window.on('close', onClose);
    window.on('closed', onClosed);
    window.webContents.on('did-fail-load', onDidFailLoad);

    // 返回清理函数
    return () => {
      window.webContents.removeListener('did-finish-load', onDidFinishLoad);
      window.removeListener('maximize', onMaximize);
      window.removeListener('unmaximize', onUnmaximize);
      window.removeListener('minimize', onMinimize);
      window.removeListener('restore', onRestore);
      window.removeListener('resize', onResize);
      window.removeListener('close', onClose);
      window.removeListener('closed', onClosed);
      window.webContents.removeListener('did-fail-load', onDidFailLoad);
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
  private loadWindowContent(window: BrowserWindow, url: string): void {
    try {
      const baseUrl = process.env['VITE_DEV_SERVER_URL']
        ? process.env['VITE_DEV_SERVER_URL']
        : path.join(__dirname, '../index.html');

      if (process.env['VITE_DEV_SERVER_URL']) {
        window.loadURL(baseUrl + '/#' + url).catch((error) => {
          console.error('Failed to load URL:', error);
        });
      } else {
        window.loadFile(baseUrl, { hash: url }).catch((error) => {
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
  public closeAllWindows(): void {
    this.requireQuit = true;

    // 先通知所有窗口准备退出
    const promises: Promise<void>[] = [];
    this.windows.forEach((managed) => {
      if (this.isValidWindow(managed.window)) {
        // 发送退出信号
        try {
          managed.window.webContents.send('app-quit');
        } catch (error) {
          console.error(`Failed to send quit signal to window "${managed.key}":`, error);
        }

        // 清理事件监听器
        if (managed.cleanup) {
          try {
            managed.cleanup();
          } catch (error) {
            console.error(`Failed to cleanup window "${managed.key}":`, error);
          }
        }

        // 关闭窗口
        promises.push(
          new Promise<void>((resolve) => {
            managed.window.once('closed', () => resolve());
            managed.window.destroy();
          })
        );
      }
    });

    // 等待所有窗口关闭（最多等待 3 秒）
    Promise.race([
      Promise.all(promises),
      new Promise<void>((resolve) => setTimeout(resolve, 3000)),
    ]).finally(() => {
      this.windows.clear();
      this.tray?.destroy();
      this.tray = null;
    });
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
    ipcMain.on('window:new-window', (_e: IpcMainEvent, config: CreateWindowRequest) => {
      this.CreateWindow(config);
    });

    // 最小化窗口
    ipcMain.on('window:minimize', (event: IpcMainEvent) => {
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
    ipcMain.on('window:maximize', (event: IpcMainEvent) => {
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
    ipcMain.on('window:hide', (event: IpcMainEvent) => {
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
    ipcMain.on('window:show', (_event: IpcMainEvent, key: string) => {
      this.showWindow(key);
    });

    // 向指定窗口发送消息
    ipcMain.on('window:send-to', (_event: IpcMainEvent, { key, channel, data }: { key: string; channel: string; data?: any }) => {
      this.sendMessage(key, channel, data);
    });

    // 广播消息到所有窗口
    ipcMain.on('window:publish', (_event: IpcMainEvent, { channel, data }: { channel: string; data?: any }) => {
      this.broadcastMessage(channel, data);
    });
  }
}

export const windowManager = new WindowManager();
export default WindowManager;