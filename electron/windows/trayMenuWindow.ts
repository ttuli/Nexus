import { BrowserWindow, screen } from 'electron';
import { WindowKey } from '@shared/config/windowKeys';
import { IpcChannels, TrayMenuSize } from '@shared/types';
import { TRAY_MENU_CONFIG } from '@shared/config/constants';
import { CreateWindowRequest } from './windowAttribute';

/**
 * 弹层用到的窗口能力。
 * 只声明这两个方法而不直接依赖 windowManager 单例，避免与 WindowManager 形成循环引用
 * ——WindowManager 结构上已满足该接口，构造时把 this 传进来即可。
 */
export interface TrayMenuWindowHost {
    getWindow(key: WindowKey): BrowserWindow | null;
    CreateWindow(config: CreateWindowRequest): void;
}

/**
 * 托盘右键菜单弹层控制器
 *
 * 生命周期：随托盘静默预创建（窗口配置 show: false，页面加载完也不显示）→ 渲染层量完尺寸经
 * TRAY_MENU_READY 上报，主进程把还隐藏着的窗口裁到内容大小 → 右键时只做定位 + show →
 * 失焦 / 点菜单项 / Esc 后 hide。窗口全程只隐藏不销毁，直到 closeAllWindows 统一收走（退出、登出）。
 */
export class TrayMenuWindow {
    private host: TrayMenuWindowHost;
    /** 托盘图标在屏幕上的矩形（DIP），弹层以此为锚点摆放 */
    private anchor: Electron.Rectangle | null = null;
    /** 渲染层上报的弹层尺寸，缓存后供再次弹出时直接定位 */
    private size: TrayMenuSize | null = null;
    /** 右键来得比渲染层上报尺寸还早时挂起，等尺寸到位立刻弹出 */
    private pendingShow = false;
    /** 挂起状态的兜底计时器：尺寸迟迟不来也要把菜单弹出来 */
    private fallbackTimer: NodeJS.Timeout | null = null;

    constructor(host: TrayMenuWindowHost) {
        this.host = host;
    }

    /**
     * 预创建弹层窗口：随托盘一起静默建好并加载完页面。
     * 之后右键只剩“定位 + show”，既没有现建现加载的延迟，也不会看到页面挂载过程。
     */
    public prepare(): void {
        if (this.host.getWindow(WindowKey.TrayMenu)) return;
        this.host.CreateWindow({ key: WindowKey.TrayMenu });
    }

    /**
     * 在托盘图标附近弹出菜单
     */
    public show(anchor: Electron.Rectangle): void {
        this.anchor = anchor;

        // 正常情况下窗口已由 prepare 备好；这里兜底预创建失败或窗口被销毁的情况
        this.prepare();
        const window = this.host.getWindow(WindowKey.TrayMenu);
        if (!window) return;

        // 尺寸还没上报（刚补建 / 渲染层异常）：挂起等 TRAY_MENU_READY，
        // 同时留一个兜底计时器，避免上报丢了就右键无反应
        if (!this.size) {
            this.pendingShow = true;
            this.startFallback();
            return;
        }

        this.present(window, this.size);
    }

    /**
     * 收起弹层（点击菜单项、点击空白、Esc 均走这里；失焦由窗口 onBlur 钩子处理）。
     * 只隐藏不销毁，下次右键直接复用。
     */
    public hide(): void {
        const window = this.host.getWindow(WindowKey.TrayMenu);
        if (window && window.isVisible()) {
            window.hide();
        }
    }

    /**
     * 渲染层上报测量尺寸
     */
    public handleReady(size: TrayMenuSize): void {
        const window = this.host.getWindow(WindowKey.TrayMenu);
        if (!window || !size?.width || !size?.height) return;
        this.size = size;

        if (this.pendingShow) {
            // 预创建还没完成用户就右键了：尺寸一到位立刻补上这次弹出
            this.present(window, size);
        } else {
            // 静默预创建阶段：先把窗口裁到内容大小，右键时只剩定位
            window.setBounds({ width: size.width, height: size.height });
        }
    }

    /**
     * 清空缓存状态。窗口随 closeAllWindows 销毁后必须调用，下次登录会重新预创建。
     */
    public reset(): void {
        this.clearFallback();
        this.pendingShow = false;
        this.anchor = null;
        this.size = null;
    }

    /**
     * 定位并显示弹层
     */
    private present(window: BrowserWindow, size: TrayMenuSize | null): void {
        this.clearFallback();
        this.pendingShow = false;
        this.place(window, size);
        window.show();

        // show() 本身已带焦点，只在没拿到时补一次：多余的 focus() 会在 Windows 上
        // 触发一次额外的窗口激活。但焦点必须有——拿不到就等不到 blur，菜单收不回去。
        if (!window.isFocused()) {
            window.focus();
        }

        // 窗口是复用的，DOM 不会重建，入场动画得由主进程显式触发。
        // 放在 show() 之后：此刻卡片还停在收起时重置的透明状态，
        // Windows 重新合成透明窗的那一两帧就算是脏的也看不见。
        window.webContents.send(IpcChannels.TRAY_MENU_SHOW);
    }

    /** 挂起弹出的兜底：到点仍没等到尺寸上报，就按窗口当前的占位尺寸先弹出来 */
    private startFallback(): void {
        if (this.fallbackTimer) return;
        this.fallbackTimer = setTimeout(() => {
            this.fallbackTimer = null;
            if (!this.pendingShow) return;
            const window = this.host.getWindow(WindowKey.TrayMenu);
            if (window) {
                console.warn('[TrayMenuWindow] Size not reported in time, showing with placeholder size');
                this.present(window, null);
            }
        }, TRAY_MENU_CONFIG.readyFallbackMs);
    }

    private clearFallback(): void {
        if (this.fallbackTimer) {
            clearTimeout(this.fallbackTimer);
            this.fallbackTimer = null;
        }
    }

    /**
     * 按托盘图标锚点摆放弹层：
     * 图标在屏幕下半部分（任务栏在底部）时菜单向上弹，否则向下弹，最后收敛进工作区避免被边缘裁掉。
     */
    private place(window: BrowserWindow, size: TrayMenuSize | null): void {
        const anchor = this.anchor;
        if (!anchor) return;

        const current = window.getBounds();
        const width = size?.width || current.width;
        const height = size?.height || current.height;

        // 多屏时按锚点所在显示器取工作区（工作区已排除任务栏）
        const display = screen.getDisplayMatching({
            x: anchor.x,
            y: anchor.y,
            width: Math.max(anchor.width, 1),
            height: Math.max(anchor.height, 1),
        });
        const area = display.workArea;

        let x = Math.round(anchor.x + anchor.width / 2 - width / 2);
        let y = anchor.y + anchor.height / 2 > area.y + area.height / 2
            ? Math.round(anchor.y - height - TRAY_MENU_CONFIG.gap)
            : Math.round(anchor.y + anchor.height + TRAY_MENU_CONFIG.gap);

        const margin = TRAY_MENU_CONFIG.screenMargin;
        x = Math.min(Math.max(x, area.x + margin), area.x + area.width - width - margin);
        y = Math.min(Math.max(y, area.y + margin), area.y + area.height - height - margin);

        window.setBounds({ x, y, width, height });
    }
}
