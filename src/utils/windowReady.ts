/**
 * Window Ready Signal Composable
 * 
 * 用于在 Vue 组件数据加载完成后通知主进程显示窗口，
 * 避免窗口显示时内容闪烁。
 */

import { IpcChannels } from '@/src/types'

let signalSent = false;

/**
 * 通知主进程窗口已准备就绪，可以显示
 * 
 * @example
 * // 在数据加载完成后调用
 * onMounted(async () => {
 *   await loadData();
 *   signalWindowReady();
 * });
 */
export function signalWindowReady(): void {
    if (signalSent) return;
    signalSent = true;
    window.ipcRenderer.send(IpcChannels.WINDOW_READY);
}

/**
 * 重置信号状态（用于热重载等场景）
 */
export function resetWindowReadySignal(): void {
    signalSent = false;
}
