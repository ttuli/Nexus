import { BrowserWindow } from 'electron';
import koffi from 'koffi';
import os from 'os';

// ==================== koffi 类型定义 ====================

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

const DwmSetWindowAttribute = dwmapi.func(
    'long __stdcall DwmSetWindowAttribute(intptr hwnd, uint32 dwAttribute, void *pvAttribute, uint32 cbAttribute)'
);

const DwmExtendFrameIntoClientArea = dwmapi.func(
    'long __stdcall DwmExtendFrameIntoClientArea(intptr hwnd, MARGINS *pMarInset)'
);


// ==================== 操作系统版本检测 ====================

/**
 * 检测当前 Windows 版本信息
 * - Win11 22H2+ (Build >= 22621): 支持 DWMWA_SYSTEMBACKDROP_TYPE（高性能）
 * - Win11 (Build >= 22000): 支持 Mica，但不支持 DWMWA_SYSTEMBACKDROP_TYPE
 * - Win10 1709+ (Build >= 16299): 仅支持 SetWindowCompositionAttribute
 */
function getWindowsBuild(): number {
    const release = os.release(); // e.g. "10.0.22621"
    const parts = release.split('.');
    return parseInt(parts[2] || '0', 10);
}

const winBuild = getWindowsBuild();

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
 * 恢复窗口装饰效果（阴影 + 圆角）
 * transparent: true 会移除 DWM 窗口边框，此函数通过 DWM API 手动恢复
 *
 * - Win10 & Win11: 通过 DwmExtendFrameIntoClientArea 恢复窗口阴影
 * - Win11 (Build >= 22000): 额外恢复圆角效果
 *
 * @param window - Electron BrowserWindow 实例
 */
export function restoreWindowDecorations(window: BrowserWindow): void {
    if (process.platform !== 'win32') return;

    try {
        const hwnd = getHwnd(window);

        // ─── 阴影恢复 ───
        // Win10: transparent: false → DWM 本身就会绘制阴影，此调用为双重保险
        // Win11: transparent: true 移除了 DWM 边框，需要通过此调用恢复阴影
        const margins = {
            cxLeftWidth: -1,
            cxRightWidth: -1,
            cyTopHeight: -1,
            cyBottomHeight: -1,
        };
        const marginResult = DwmExtendFrameIntoClientArea(hwnd, margins);
        console.log(`[AcrylicBlur] DwmExtendFrameIntoClientArea (Win11) HRESULT: 0x${(marginResult >>> 0).toString(16)}`);

        console.log(winBuild)
        // ─── 圆角恢复 (仅 Win11, Build >= 22000) ───
        if (winBuild >= 22000) {
            // DWMWA_WINDOW_CORNER_PREFERENCE = 33
            // DWMWCP_ROUND = 2 (圆角)
            const cornerPref = Buffer.alloc(4);
            cornerPref.writeInt32LE(2);
            const cornerResult = DwmSetWindowAttribute(hwnd, 33, cornerPref, 4);
            console.log(`[AcrylicBlur] DwmSetWindowAttribute (corner) HRESULT: 0x${(cornerResult >>> 0).toString(16)}`);
        }
    } catch (error) {
        console.error('[AcrylicBlur] Failed to restore window decorations:', error);
    }
}
