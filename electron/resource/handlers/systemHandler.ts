import { powerMonitor } from "electron";
import { wsManager } from "../../websocket";

export function setupSystemHandlers() {
    powerMonitor.on('suspend', handleSuspend);

    powerMonitor.on('resume', handleResume);
}

function handleSuspend() {
    console.log('System is suspending');
    wsManager.closeWs();
}

function handleResume() {
    console.log('System is resuming');
    wsManager.connect();
}