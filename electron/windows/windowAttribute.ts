import { BrowserWindow, app } from 'electron';
import { WindowKey } from '@shared/config/windowKeys';
import { WINDOW_SPECS, type WindowSpec } from '@shared/config/window';
import { notifyUpdateWindowClosed } from '@/electron/update/updateSignals';

// 窗口状态接口（用于持久化）
export interface WindowState {
    x?: number;
    y?: number;
    width: number;
    height: number;
    isMaximized?: boolean;
    isMinimized?: boolean;
}

// 窗口生命周期钩子接口
export interface WindowHooks {
    /** 窗口将要关闭时（window 还未销毁，可用于保存状态或阻止关闭） */
    onClose?: (window: BrowserWindow, event: Electron.Event) => void;
    /** 窗口已关闭销毁后 */
    onClosed?: (wm?: any) => void;
    /** 窗口获得焦点时 */
    onFocus?: (window: BrowserWindow) => void;
    /** 窗口失去焦点时（弹层类窗口据此收起） */
    onBlur?: (window: BrowserWindow) => void;
    /** 窗口最大化时 */
    onMaximize?: (window: BrowserWindow) => void;
    /** 窗口最小化时 */
    onMinimize?: (window: BrowserWindow) => void;
    /** 窗口还原时 */
    onRestore?: (window: BrowserWindow) => void;
}

// 窗口创建配置接口（在纯声明式 WindowSpec 基础上扩展主进程运行时字段与生命周期钩子）
export interface WindowConfig extends Electron.BrowserWindowConstructorOptions, Omit<WindowSpec, 'webPreferences'> {
    data?: Record<string, any>;
    // 窗口专属生命周期钩子
    hooks?: WindowHooks;
}

// 窗口创建请求接口
export interface CreateWindowRequest {
    key: WindowKey;
    data?: Record<string, any>;
    /** 可选：覆盖窗口默认宽高（像素，主进程屏幕坐标系） */
    windowSize?: { width: number; height: number };
}

// 管理的窗口接口
export interface ManagedWindow {
    key: WindowKey;
    window: BrowserWindow;
    url: string;
    data?: Record<string, any>;
    // 事件监听器清理函数
    cleanup?: () => void;
}

/** 依赖 Electron 运行时的窗口生命周期钩子（声明式属性见 share/config/window.ts） */
const WINDOW_HOOKS: Partial<Record<WindowKey, WindowHooks>> = {
    [WindowKey.Login]: {
        onClosed: (wm?: any) => {
            // 如果不是在向 home 窗口过渡，则退出应用
            if (!wm || !wm.getWindow(WindowKey.Home)) {
                app.quit();
            }
        },
    },
    [WindowKey.Home]: {
        onClose: (window: BrowserWindow, event: Electron.Event) => {
            event.preventDefault();
            window.hide();
        },
    },
    [WindowKey.TrayMenu]: {
        // 失焦即收起。窗口保留复用（下次右键直接 show），避免每次都重新加载页面
        onBlur: (window: BrowserWindow) => {
            if (window.isVisible()) window.hide();
        },
    },
    [WindowKey.Update]: {
        // 用户关窗的后续（放弃下载 / 退出应用）由 updateManager 按更新模式决定
        onClosed: () => notifyUpdateWindowClosed(),
    },
};

const configs: Map<WindowKey, WindowConfig> = new Map(
    (Object.values(WINDOW_SPECS) as WindowSpec[]).map((spec) => [
        spec.key,
        {
            ...spec,
            ...(spec.webPreferences ? { webPreferences: { ...spec.webPreferences } } : {}),
            ...(WINDOW_HOOKS[spec.key] ? { hooks: WINDOW_HOOKS[spec.key] } : {}),
        },
    ])
);

export default configs;
