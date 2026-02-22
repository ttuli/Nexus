
import { Tray, Menu, nativeImage, app } from 'electron';
import path from 'path';

/**
 * 托盘操作的回调接口
 */
export interface TrayCallbacks {
    onShowHome: () => void;
    onOpenSettings: () => void;
    onQuit: () => void;
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

            let iconPath = path.join(publicPath, 'icon_small.png');

            // 如果是在开发环境，VITE_PUBLIC 可能指向 public 目录
            // 生产环境下，通常图标在用于打包的资源目录

            // 尝试读取图标
            let icon = nativeImage.createFromPath(iconPath);

            if (icon.isEmpty()) {
                // 尝试其他路径，或者记录错误
                // 如果是 dev 环境，可能是 public/icon.png
                iconPath = path.join(process.cwd(), 'public', 'icon.png');
                icon = nativeImage.createFromPath(iconPath);
            }

            if (icon.isEmpty()) {
                console.error('[TrayManager] Failed to load tray icon from:', iconPath);
                return;
            }

            // 调整图标大小 (Windows 推荐 16x16 或 24x24)
            icon = icon.resize({ width: 24, height: 24, quality: 'best' });

            this.tray = new Tray(icon);

            // 辅助函数：获取菜单图标
            const getMenuIcon = (name: string) => {
                const iconPath = path.join(publicPath, 'tray', name);
                // 同样尝试 fallback
                let menuIcon = nativeImage.createFromPath(iconPath);
                if (menuIcon.isEmpty()) {
                    menuIcon = nativeImage.createFromPath(path.join(process.cwd(), 'public', 'tray', name));
                }
                return menuIcon.resize({ width: 16, height: 16 });
            };

            const contextMenu = Menu.buildFromTemplate([
                {
                    label: 'IMChat',
                    enabled: false,
                },
                {
                    type: 'separator',
                },
                {
                    label: '打开主界面',
                    icon: getMenuIcon('message.svg'),
                    click: () => {
                        this.callbacks.onShowHome();
                    },
                },
                {
                    label: '设置',
                    icon: getMenuIcon('setting.svg'),
                    click: () => {
                        this.callbacks.onOpenSettings();
                    },
                },
                {
                    label: '退出',
                    icon: getMenuIcon('exit.svg'),
                    click: () => {
                        this.callbacks.onQuit();
                    },
                },
            ]);

            // 托盘图标点击事件
            this.tray.on('click', () => {
                this.callbacks.onShowHome();
            });

            // 托盘图标右键菜单
            this.tray.setContextMenu(contextMenu);
            this.tray.setToolTip(app.getName());

            console.log('[TrayManager] Tray created successfully');
        } catch (error) {
            console.error('[TrayManager] Failed to create tray:', error);
        }
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
