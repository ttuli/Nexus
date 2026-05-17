import { BrowserWindow } from 'electron';
import koffi from 'koffi';
import os from 'os';

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
const isWin11_22H2 = winBuild >= 22621;  // 支持 DWMWA_SYSTEMBACKDROP_TYPE

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
 * 启用窗口背景模糊效果，自动选择最高性能的实现方式
 *
 * 策略：
 * 1. Win11 22H2+ → DwmSetWindowAttribute(DWMWA_SYSTEMBACKDROP_TYPE = Acrylic)
 *    由 DWM compositor 管理，不阻塞窗口线程，拖动完全流畅
 * 2. 旧版 Windows → SetWindowCompositionAttribute(ACCENT_ENABLE_BLURBEHIND)
 *    使用轻量级 blur 代替重量级 acrylic（去掉了昂贵的噪声纹理层）
 *
 * @param window - Electron BrowserWindow 实例
 * @param tintColor - 模糊色调，ABGR 格式的 uint32（仅 fallback 路径使用）
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

        if (isWin11_22H2) {
            // ─── 高性能路径: DWM System Backdrop ───
            // DWMWA_SYSTEMBACKDROP_TYPE = 38
            // DWM_SYSTEMBACKDROP_TYPE: 0=Auto, 1=None, 2=Mica, 3=Acrylic, 4=MicaAlt
            const backdropType = Buffer.alloc(4);
            backdropType.writeInt32LE(3); // Acrylic
            const hr = DwmSetWindowAttribute(hwnd, 38, backdropType, 4);
            console.log(`[AcrylicBlur] DWM SystemBackdrop (Acrylic) HRESULT: 0x${(hr >>> 0).toString(16)}`);
            return hr === 0;
        }

        // ─── Fallback 路径: 使用轻量 BlurBehind 代替 AcrylicBlurBehind ───
        // AccentState 3 = ACCENT_ENABLE_BLURBEHIND (轻量，无噪声纹理)
        // AccentState 4 = ACCENT_ENABLE_ACRYLICBLURBEHIND (重量，每帧计算噪声)
        // BlurBehind 没有噪声纹理层，视觉上更透明，需要提高 alpha 补偿
        const alpha = (tintColor >>> 24) & 0xFF;
        const boostedAlpha = Math.min(alpha + 0x77, 0xFF); // 提升约 26% 不透明度
        const boostedTint = ((boostedAlpha << 24) | (tintColor & 0x00FFFFFF)) >>> 0;

        const policy = {
            AccentState: 3,     // ACCENT_ENABLE_BLURBEHIND（比 4 轻量很多）
            AccentFlags: 2,     // ACCENT_FLAG_DRAW_ALL
            GradientColor: boostedTint,
            AnimationId: 0,
        };

        const data = {
            Attribute: 19,      // WCA_ACCENT_POLICY
            Data: policy,
            SizeOfData: koffi.sizeof(AccentPolicy),
        };

        const result = SetWindowCompositionAttribute(hwnd, data);
        console.log(`[AcrylicBlur] SetWindowCompositionAttribute (BlurBehind) result: ${result}`);
        return result;
    } catch (error) {
        console.error('[AcrylicBlur] Failed to enable backdrop blur:', error);
        return false;
    }
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
        DwmExtendFrameIntoClientArea(hwnd, margins);
        // ─── 圆角恢复 (仅 Win11, Build >= 22000) ───
        if (winBuild >= 22000) {
            const cornerPref = Buffer.alloc(4);
            cornerPref.writeInt32LE(2);
            DwmSetWindowAttribute(hwnd, 33, cornerPref, 4);
        }
    } catch (error) {
        console.error('[AcrylicBlur] Failed to restore window decorations:', error);
    }
}
