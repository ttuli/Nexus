import { setupAuthHandlers } from './handlers/authHandler';
import { setupTokenHandlers } from './handlers/tokenHandler';
import { setupResourceHandlers } from './handlers/resourceHandler';
import { setupUserHandlers } from './handlers/userHandler';
import { setupGroupHandlers } from './handlers/groupHandler';
import { setupSettingsHandlers } from './handlers/settingsHandler';
import { setupMessageHandlers } from './handlers/messageHandler';
import { setupProtocolHandler } from './handlers/protocolHandler';
import { setupConversationHandlers } from './handlers/conversationHandler';

/**
 * 设置所有 IPC 处理器
 */
export function setupIpcHandlers(): void {
    setupAuthHandlers();
    setupTokenHandlers();
    setupResourceHandlers();
    setupUserHandlers();
    setupGroupHandlers();
    setupSettingsHandlers();
    setupMessageHandlers();
    setupProtocolHandler();
    setupConversationHandlers();
}
