
import { Tray, nativeImage, app, screen } from 'electron';
import path from 'path';
import { TrayMenuAction } from '@shared/types';
import { APP_ICON } from '@shared/config/constants';

/**
 * 托盘操作的回调接口
 */
export interface TrayCallbacks {
    onShowHome: () => void;
    onOpenSettings: () => void;
    onQuit: () => void;
    /** 右键托盘：在锚点矩形（托盘图标屏幕位置，DIP）附近弹出自定义菜单窗口 */
    onOpenMenu: (anchor: Electron.Rectangle) => void;
}

/**
 * 托盘管理器
 * 负责系统托盘图标、右键菜单及相关事件的处理
 */
export class TrayManager {
    private tray: Tray | null = null;
    private callbacks: TrayCallbacks;
    private isDestroyed = false;

    constructor(callbacks: TrayCallbacks) {
        this.callbacks = callbacks;
    }

    /**
     * 创建托盘图标
     */
    public createTray(): void {
        if (this.tray || this.isDestroyed) return;

        try {
            // 获取图标路径 (兼容开发和生产环境)
            // __dirname 在 ESM 中可能需要额外处理，这里假设调用方环境类似 windowManager
            // 实际上 windowManager 中使用了 import.meta.url，这里最好传入 basePath 或者直接在这里处理

            // 为了简化，假设 process.env.VITE_PUBLIC 已正确设置或回退策略
            // 在 windowManager 中： path.join(process.env.VITE_PUBLIC || __dirname, 'icon.png');
            // 这里我们需要确保 __dirname 的可用性，或者让调用者传入 icon path。
            // 更好的方式是传入 base path。

            // 重新审视 windowManager 的实现，它定义了 __dirname
            // const __filename = fileURLToPath(import.meta.url);
            // const __dirname = path.dirname(__filename);

            // 我们在类中暂时直接使用 process.env.VITE_PUBLIC，如果 undefined 则可能需要从构造函数传入资源路径
            const publicPath = process.env.VITE_PUBLIC || app.getAppPath(); // fallback to app path if needed

            // 注意：windowManager 中使用的 __dirname 是编译后的位置
            // 我们这里也是在 electron/windows 下，所以 resource path 应该相似

            let iconPath = path.join(publicPath, APP_ICON.normal);

            // 如果是在开发环境，VITE_PUBLIC 可能指向 public 目录
            // 生产环境下，通常图标在用于打包的资源目录

            // 尝试读取图标
            let icon = nativeImage.createFromPath(iconPath);

            if (icon.isEmpty()) {
                // 尝试其他路径，或者记录错误
                // 如果是 dev 环境，可能是 public/icon.png
                iconPath = path.join(process.cwd(), 'public', APP_ICON.normal);
                icon = nativeImage.createFromPath(iconPath);
            }

            if (icon.isEmpty()) {
                console.error('[TrayManager] Failed to load tray icon from:', iconPath);
                return;
            }

            // 调整图标大小 (Windows 推荐 16x16 或 24x24)
            icon = icon.resize({ width: 24, height: 24, quality: 'best' });

            this.tray = new Tray(icon);

            // 托盘图标点击事件
            this.tray.on('click', () => {
                this.callbacks.onShowHome();
            });

            // 右键弹出自定义菜单窗口（不调用 setContextMenu，系统默认菜单就不会出现）
            this.tray.on('right-click', (_event, bounds) => {
                this.callbacks.onOpenMenu(this.getAnchorRect(bounds));
            });

            this.tray.setToolTip(app.getName());

            console.log('[TrayManager] Tray created successfully');
        } catch (error) {
            console.error('[TrayManager] Failed to create tray:', error);
        }
    }

    /**
     * 分发自定义菜单窗口回传的菜单项动作
     */
    public runMenuAction(action: TrayMenuAction): void {
        switch (action) {
            case TrayMenuAction.ShowHome:
                this.callbacks.onShowHome();
                break;
            case TrayMenuAction.OpenSettings:
                this.callbacks.onOpenSettings();
                break;
            case TrayMenuAction.Quit:
                this.callbacks.onQuit();
                break;
            default:
                console.warn('[TrayManager] Unknown tray menu action:', action);
        }
    }

    /**
     * 计算菜单锚点：优先用 right-click 事件回传的图标矩形，
     * 个别系统/多屏场景下拿不到（全 0）时退化为当前鼠标位置。
     */
    private getAnchorRect(bounds?: Electron.Rectangle): Electron.Rectangle {
        const rect = bounds && bounds.width > 0 && bounds.height > 0 ? bounds : this.tray?.getBounds();
        if (rect && rect.width > 0 && rect.height > 0) {
            return rect;
        }
        const point = screen.getCursorScreenPoint();
        return { x: point.x, y: point.y, width: 0, height: 0 };
    }

    /**
     * 更新托盘提示信息
     */
    public setToolTip(toolTip: string): void {
        if (this.tray && !this.isDestroyed) {
            this.tray.setToolTip(toolTip);
        }
    }

    /**
     * 销毁托盘
     */
    public destroy(): void {
        this.isDestroyed = true;
        if (this.tray) {
            this.tray.destroy();
            this.tray = null;
        }
    }
}
