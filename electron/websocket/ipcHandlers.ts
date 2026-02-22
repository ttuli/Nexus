import { ipcMain, BrowserWindow } from 'electron';
import { wsManager } from './WebSocketManager';
import { IpcChannels, ImTypes } from '../../src/types';

/**
 * Setup WebSocket IPC handlers for renderer communication
 */
export function setupWsIpcHandlers(): void {
    // Connect to WebSocket server
    ipcMain.handle(IpcChannels.WS_CONNECT, async (_event) => {
        try {
            wsManager.connect();
            return { success: true };
        } catch (error) {
            console.error('[WS IPC] Connect error:', error);
            return { success: false, error: (error as Error).message };
        }
    });

    // Send a message
    ipcMain.handle(IpcChannels.WS_SEND, async (_event, message: ImTypes.WSMessage, clientId: string) => {
        // message is coming from renderer, payload might be Buffer or standard JS object if not properly serialized
        try {
            const msg = { ...message, clientId: clientId }
            const sent = wsManager.send(msg);
            return { sent:sent };
        } catch (error) {
            console.error('[WS IPC] Send error:', error);
            return { sent: false, error: (error as Error).message };
        }
    });

    console.log('[WS IPC] Handlers registered');
}

/**
 * Forward WebSocket events to renderer windows
 * Call this after wsManager is initialized
 */
export function setupWsEventForwarding(): void {
    wsManager.on('stateChange', (event: ImTypes.ConnectionState) => {
        // Broadcast state change to all windows
        // Broadcast state change to all windows
        BrowserWindow.getAllWindows().forEach((win: Electron.BrowserWindow) => {
            if (!win.isDestroyed()) {
                win.webContents.send(IpcChannels.WS_STATE_CHANGE, event);
            }
        });
    });
}
