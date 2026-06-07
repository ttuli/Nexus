import { IpcChannels } from '@/types'

export enum LogoutType {
    LOGOUT = 'logout',
    KICKED = 'kicked',
}

export function createWindow(key: string, data?: any) {
    window.ipcRenderer.send(IpcChannels.WINDOW_NEW, {
        key: key,
        data: data
    })
}


/** 计算适合屏幕和媒体原始尺寸的窗口大小 */
function calcViewerSize(
    mediaW: number,
    mediaH: number,
    opts = { minW: 400, minH: 300, maxRatio: 0.85 }
): { width: number; height: number } {
    const sw = window.screen.availWidth;
    const sh = window.screen.availHeight;
    const maxW = Math.floor(sw * opts.maxRatio);
    const maxH = Math.floor(sh * opts.maxRatio);

    // 等比缩放：先按原始尺寸，再限制到最大
    let w = mediaW;
    let h = mediaH;
    if (w > maxW || h > maxH) {
        const ratio = Math.min(maxW / w, maxH / h);
        w = Math.floor(w * ratio);
        h = Math.floor(h * ratio);
    }

    // 不能小于最小值
    w = Math.max(w, opts.minW);
    h = Math.max(h, opts.minH);

    // 额外加上标题栏高度（35px titlebar + 50px toolbar）
    h = Math.min(h + 85, maxH);

    return { width: w, height: h };
}

/**
 * 打开图片浏览窗口
 * 如果没有传入 initialSize，则预先加载图片尺寸，计算好合适的窗口大小，避免窗口跳变
 */
export async function openPhotoViewer(urls: string[], index = 0, initialSize?: { width: number; height: number }): Promise<void> {
    const url = urls[index];
    let windowSize = { width: 800, height: 600 };

    if (initialSize && initialSize.width > 0 && initialSize.height > 0) {
        windowSize = calcViewerSize(initialSize.width, initialSize.height);
    } else if (url) {
        try {
            const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
                img.onerror = reject;
                img.src = url;
            });
            windowSize = calcViewerSize(size.width, size.height);
        } catch {
            // 如果图片无法预加载（如签名 URL 需要特殊协议处理），使用默认大小
        }
    }

    window.ipcRenderer.send(IpcChannels.WINDOW_NEW, {
        key: 'photoViewer',
        data: { urls, index },
        windowSize,
    });
}

/**
 * 打开视频播放窗口
 * 使用 16:9 宽高比计算合适的窗口大小
 */
export function openVideoViewer(url: string, width?: number, height?: number): void {
    // 如果有视频尺寸元数据，用实际比例；否则默认 16:9
    const mediaW = width || 1280;
    const mediaH = height || 720;
    const windowSize = calcViewerSize(mediaW, mediaH);

    window.ipcRenderer.send(IpcChannels.WINDOW_NEW, {
        key: 'videoViewer',
        data: { url },
        windowSize,
    });
}


export function logout(type: LogoutType) {
    window.ipcRenderer.send(IpcChannels.WINDOW_PUBLISH, {
        channel: IpcChannels.LOGOUT_REMIND,
        data: {
            type: type
        }
    })
}
