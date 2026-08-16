import { ipcMain, BrowserWindow, IpcMainEvent, IpcMainInvokeEvent } from 'electron';
import { IpcChannels, TrayMenuAction, TrayMenuSize } from '@shared/types';
import { WindowKey } from '@shared/config/windowKeys';
import { CreateWindowRequest } from './windowAttribute';
// 只取类型：windowManager 反过来要导入本文件，值导入会成环
import type WindowManager from './windowManager';

/**
 * 取出发来消息的窗口，已销毁或取不到则返回 null（send 与 invoke 两种事件都收）
 */
function getSenderWindow(manager: WindowManager, event: IpcMainEvent | IpcMainInvokeEvent): BrowserWindow | null {
    const sender = BrowserWindow.fromWebContents(event.sender);
    return sender && manager.isValidWindow(sender) ? sender : null;
}

/**
 * 设置窗口相关 IPC 处理器
 */
export function setupWindowIpcHandlers(manager: WindowManager): void {
    // 创建新窗口
    ipcMain.on(IpcChannels.WINDOW_NEW, (_e: IpcMainEvent, config: CreateWindowRequest) => {
        manager.CreateWindow(config);
    });

    // 最小化窗口
    ipcMain.on(IpcChannels.WINDOW_MINIMIZE, (event: IpcMainEvent) => {
        try {
            getSenderWindow(manager, event)?.minimize();
        } catch (error) {
            console.error('Failed to minimize window:', error);
        }
    });

    // 最大化/还原窗口
    ipcMain.on(IpcChannels.WINDOW_MAXIMIZE, (event: IpcMainEvent) => {
        try {
            const sender = getSenderWindow(manager, event);
            if (!sender) return;
            if (sender.isMaximized()) {
                sender.unmaximize();
            } else {
                sender.maximize();
            }
        } catch (error) {
            console.error('Failed to maximize/unmaximize window:', error);
        }
    });

    // 关闭窗口
    ipcMain.on(IpcChannels.WINDOW_CLOSE, (event: IpcMainEvent) => {
        try {
            getSenderWindow(manager, event)?.close();
        } catch (error) {
            console.error('Failed to close window:', error);
        }
    });

    // 隐藏窗口（最小化到托盘）
    ipcMain.on(IpcChannels.WINDOW_HIDE, (event: IpcMainEvent) => {
        try {
            getSenderWindow(manager, event)?.hide();
        } catch (error) {
            console.error('Failed to hide window:', error);
        }
    });

    // 显示窗口
    ipcMain.on(IpcChannels.WINDOW_SHOW, (_event: IpcMainEvent, key: WindowKey) => {
        manager.showWindow(key);
    });

    // 向指定窗口发送消息
    ipcMain.on(IpcChannels.WINDOW_SEND_TO, (_event: IpcMainEvent, { key, channel, data }: { key: WindowKey; channel: string; data?: any }) => {
        manager.sendMessage(key, channel, data);
    });

    // 广播消息到所有窗口
    ipcMain.on(IpcChannels.WINDOW_PUBLISH, (_event: IpcMainEvent, { channel, data }: { channel: string; data?: any }) => {
        manager.broadcastMessage(channel, data);
    });

    // 窗口 ready 信号（统一处理所有窗口）
    ipcMain.on(IpcChannels.WINDOW_READY, (event: IpcMainEvent) => {
        manager.notifyWindowReady(event.sender.id);
    });

    // 检查窗口是否焦点状态 (invoke)
    ipcMain.handle(IpcChannels.WINDOW_IS_FOCUSED, (event) => {
        try {
            return getSenderWindow(manager, event)?.isFocused() ?? false;
        } catch (error) {
            console.error('Failed to get window focused state:', error);
            return false;
        }
    });

    // 任务栏闪烁
    ipcMain.on(IpcChannels.WINDOW_FLASH_FRAME, (event) => {
        try {
            const sender = getSenderWindow(manager, event);
            // 仅在窗口未聚焦时闪烁
            if (sender && !sender.isFocused()) {
                sender.flashFrame(true);
            }
        } catch (error) {
            console.error('Failed to handle flash frame request:', error);
        }
    });

    // 托盘菜单：渲染层量完尺寸上报
    ipcMain.on(IpcChannels.TRAY_MENU_READY, (_event: IpcMainEvent, size: TrayMenuSize) => {
        manager.handleTrayMenuReady(size);
    });

    // 托盘菜单：执行菜单项
    ipcMain.on(IpcChannels.TRAY_MENU_ACTION, (_event: IpcMainEvent, action: TrayMenuAction) => {
        manager.runTrayMenuAction(action);
    });

    // 托盘菜单：收起
    ipcMain.on(IpcChannels.TRAY_MENU_CLOSE, () => {
        manager.hideTrayMenu();
    });
}
