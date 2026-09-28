import { ipcMain } from 'electron';
import { IpcChannels, UpdatePromptAction } from '@shared/types';
import type { UpdateManager } from './updateManager';

const PROMPT_ACTIONS: readonly UpdatePromptAction[] = ['update', 'later', 'skip'];

/**
 * 更新相关 IPC。
 * invoke 类通道显式返回 { success, data }：ipcService.invoke 会对返回值做 `'success' in result`，
 * 直接返回 null 会在渲染层抛 TypeError 被当成调用失败。
 */
export function setupUpdateIpcHandlers(manager: UpdateManager): void {
    ipcMain.handle(IpcChannels.UPDATE_GET_PROMPT, () => ({ success: true, data: manager.getPrompt() }));

    ipcMain.on(IpcChannels.UPDATE_PROMPT_RESPOND, (_event, action: UpdatePromptAction) => {
        if (PROMPT_ACTIONS.includes(action)) {
            manager.respondPrompt(action);
        }
    });

    ipcMain.handle(IpcChannels.UPDATE_GET_STATE, () => ({ success: true, data: manager.getState() }));

    ipcMain.on(IpcChannels.UPDATE_RETRY, () => {
        void manager.checkAndDownload();
    });

    ipcMain.on(IpcChannels.UPDATE_INSTALL, () => manager.install());

    ipcMain.on(IpcChannels.UPDATE_CLOSE, () => manager.closeWindow());

    ipcMain.on(IpcChannels.UPDATE_OPEN_DOWNLOAD_PAGE, () => manager.openDownloadPage());

    ipcMain.on(IpcChannels.UPDATE_SHOW_INSTALLER, () => manager.showInstaller());
}
