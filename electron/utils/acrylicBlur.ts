import { BrowserWindow } from 'electron';
import koffi from 'koffi';

// ==================== koffi 类型定义 ====================

const user32 = koffi.load('user32.dll');
const dwmapi = koffi.load('dwmapi.dll');

// ACCENT_POLICY 结构体 (16 bytes)
const AccentPolicy = koffi.struct('AccentPolicy', {
    AccentState: 'int32',
    AccentFlags: 'int32',
    GradientColor: 'uint32',
    AnimationId: 'int32',
});

// WINDOWCOMPOSITIONATTRIBDATA 结构体
const WindowCompositionAttribData = koffi.struct('WindowCompositionAttribData', {
    Attribute: 'int32',
    Data: koffi.pointer(AccentPolicy),
    SizeOfData: 'uintptr',
});
void WindowCompositionAttribData;

// MARGINS 结构体 (用于 DwmExtendFrameIntoClientArea)
const MARGINS = koffi.struct('MARGINS', {
    cxLeftWidth: 'int',
    cxRightWidth: 'int',
    cyTopHeight: 'int',
    cyBottomHeight: 'int',
});
void MARGINS;

// Win32 API 函数
const SetWindowCompositionAttribute = user32.func(
    'bool __stdcall SetWindowCompositionAttribute(intptr hwnd, WindowCompositionAttribData *data)'
);

const DwmSetWindowAttribute = dwmapi.func(
    'long __stdcall DwmSetWindowAttribute(intptr hwnd, uint32 dwAttribute, void *pvAttribute, uint32 cbAttribute)'
);

const DwmExtendFrameIntoClientArea = dwmapi.func(
    'long __stdcall DwmExtendFrameIntoClientArea(intptr hwnd, MARGINS *pMarInset)'
);

// ==================== 工具函数 ====================

/**
 * 从 BrowserWindow 获取原生窗口句柄 (HWND)
 */
function getHwnd(window: BrowserWindow): number | bigint {
    const hwndBuf = window.getNativeWindowHandle();
    if (process.arch === 'x64' || process.arch === 'arm64') {
        return hwndBuf.readBigUInt64LE(0);
    }
    return hwndBuf.readUInt32LE(0);
}

/**
 * 使用 Win32 SetWindowCompositionAttribute API 启用亚克力模糊效果
 * 支持 Windows 10 RS3 (1709, Build 17763) 及以上版本
 *
 * @param window - Electron BrowserWindow 实例
 * @param tintColor - 模糊色调，ABGR 格式的 uint32
 */
export function enableAcrylicBlur(
    window: BrowserWindow,
    tintColor: number = 0x01000000
): boolean {
    if (process.platform !== 'win32') {
        console.warn('[AcrylicBlur] Only supported on Windows');
        return false;
    }

    try {
        const hwnd = getHwnd(window);

        // 设置 ACCENT_ENABLE_ACRYLICBLURBEHIND
        const policy = {
            AccentState: 4,     // ACCENT_ENABLE_ACRYLICBLURBEHIND
            AccentFlags: 2,     // ACCENT_FLAG_DRAW_ALL
            GradientColor: tintColor,
            AnimationId: 0,
        };

        const data = {
            Attribute: 19,      // WCA_ACCENT_POLICY
            Data: policy,
            SizeOfData: koffi.sizeof(AccentPolicy),
        };

        const result = SetWindowCompositionAttribute(hwnd, data);
        console.log(`[AcrylicBlur] SetWindowCompositionAttribute result: ${result}`);
        return result;
    } catch (error) {
        console.error('[AcrylicBlur] Failed to enable acrylic blur:', error);
        return false;
    }
}

/**
 * 恢复 Windows 11 的圆角和阴影效果
 * transparent: true 会移除 DWM 窗口边框，此函数通过 DWM API 手动恢复
 * 在 Windows 10 上调用会静默失败（无副作用）
 *
 * @param window - Electron BrowserWindow 实例
 */
export function restoreWin11RoundedCorners(window: BrowserWindow): void {
    if (process.platform !== 'win32') return;

    try {
        const hwnd = getHwnd(window);

        // DWMWA_WINDOW_CORNER_PREFERENCE = 33
        // DWMWCP_ROUND = 2 (圆角)
        const cornerPref = Buffer.alloc(4);
        cornerPref.writeInt32LE(2);
        const cornerResult = DwmSetWindowAttribute(hwnd, 33, cornerPref, 4);
        console.log(`[AcrylicBlur] DwmSetWindowAttribute (corner) HRESULT: 0x${(cornerResult >>> 0).toString(16)}`);

        // 扩展 DWM 帧到客户端区域以恢复窗口阴影
        const margins = {
            cxLeftWidth: -1,
            cxRightWidth: -1,
            cyTopHeight: -1,
            cyBottomHeight: -1,
        };
        const marginResult = DwmExtendFrameIntoClientArea(hwnd, margins);
        console.log(`[AcrylicBlur] DwmExtendFrameIntoClientArea HRESULT: 0x${(marginResult >>> 0).toString(16)}`);
    } catch (error) {
        console.error('[AcrylicBlur] Failed to restore Win11 rounded corners:', error);
    }
}
