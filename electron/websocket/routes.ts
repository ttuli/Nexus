import { WsMessage } from './serializer/MessageSerializer';
import { messageRouter, MessageHandler } from './MessageRouter';
import { windowManager } from '@/electron/windows/windowManager';
import { IpcChannels, ImTypes, LogoutType } from '@shared/types';

import { messageQueue } from './MessageQueue';

/**
 * WebSocket Message Types
 * Aliased from Proto definition
 */
export const WsMessageType = ImTypes.MessageType;
export type WsMessageTypeValue = ImTypes.MessageType;

// ============= Message Handlers =============

/**
 * Handle incoming text message
 */
const handleChatMessage: MessageHandler = async (message: WsMessage) => {
    try {
        windowManager.broadcastMessage(IpcChannels.WS_MESSAGE, {
            type: message.type,
            payload: message,
        });
    } catch (e) {
        console.error('Failed to decode TextMessage', e);
    }
};

const handleMsgAck: MessageHandler = async (message: WsMessage) => {
    try {
        if (message.payload instanceof Uint8Array) {
            try {
                // Decode MessageAck to get client_id
                const ack = ImTypes.MessageAck.decode(message.payload);

                messageQueue.acknowledge(ack.client_id);
                windowManager.broadcastMessage(IpcChannels.WS_MESSAGE_ACK, {
                    ack: ack,
                    timestamp: message.timestamp,
                });
            } catch (e) {
                console.error('[WebSocketManager] Failed to decode ACK', e);
            }
        } else {
            console.error('[WebSocketManager] Invalid payload type for ACK');
        }
    } catch (e) {
        console.error('Failed to decode MsgAck', e);
    }
};

const handleMsgPersistAck: MessageHandler = async (message: WsMessage) => {
    try {
        if (message.payload instanceof Uint8Array) {
            try {
                const ack = ImTypes.PersistAck.decode(message.payload);

                messageQueue.acknowledge(ack.client_id);
                windowManager.broadcastMessage(IpcChannels.WS_MESSAGE_PERSIST_ACK, {
                    ack: ack,
                    timestamp: message.timestamp,
                });
            } catch (e) {
                console.error('[WebSocketManager] Failed to decode ACK', e);
            }
        } else {
            console.error('[WebSocketManager] Invalid payload type for ACK');
        }
    } catch (e) {
        console.error('Failed to decode MsgAck', e);
    }
};

/**
 * Handle friend request notification
 */
const handleNotification: MessageHandler = async (message: WsMessage) => {
    try {
        if (message.type === ImTypes.MessageType.USER_KICKOFF) {
            windowManager.broadcastMessage(IpcChannels.LOGOUT_REMIND, {
                type: LogoutType.KICKED,
            });
            return
        }
        windowManager.broadcastMessage(IpcChannels.WS_NOTIFICATION, {
            type: message.type,
            payload: message,
        });
    } catch (e) {
        console.error('Failed to decode FriendRequest', e);
    }
};

/**
 * Handle message recall
 */
const handleMessageRecall: MessageHandler = async (message: WsMessage) => {
    try {
        const payload = message.payload instanceof Uint8Array
            ? ImTypes.MessageRecall.decode(message.payload)
            : message.payload;

        console.log('[Routes] Received message recall:', payload);

        // Broadcast to renderers
        windowManager.broadcastMessage(IpcChannels.WS_MESSAGE, {
            type: message.type,
            payload: payload,
            timestamp: message.timestamp,
        });
    } catch (e) {
        console.error('Failed to decode MessageRecall', e);
    }
};

/**
 * Handle offline notification (kicked by another device)
 * Using CustomMessage or SystemNotification if specific type unknown, 
 * or assuming payload is JSON bytes.
 */
const handleOfflineNotify: MessageHandler = async (_message: WsMessage) => {
    // TODO: Identify correct proto message for offline notify. 
    // For now assuming it might be SystemNotification or we pass payload
    console.log('[Routes] Received offline notification');

    // Broadcast to renderers
    windowManager.broadcastMessage(IpcChannels.WS_OFFLINE_NOTIFY, {
        reason: 'Connection closed (Offline Notify)',
    });
};

const handleErrorMessage: MessageHandler = async (message: WsMessage) => {
    try {
        const payload = message.payload instanceof Uint8Array
            ? ImTypes.ErrorMessage.decode(message.payload)
            : message.payload;

        console.log('[Routes] Received error message:', payload);

        // Broadcast to renderers
        windowManager.broadcastMessage(IpcChannels.WS_MESSAGE, {
            type: message.type,
            payload: payload,
            timestamp: message.timestamp,
        });
    } catch (e) {
        console.error('Failed to decode ErrorMessage', e);
    }
};

// ============= Route Table =============

/**
 * Main route table - maps message types to handlers
 */
export const wsRouteTable: Record<number, MessageHandler> = {
    [ImTypes.MessageType.CHAT_TEXT]: handleChatMessage,
    [ImTypes.MessageType.CHAT_IMAGE]: handleChatMessage,
    [ImTypes.MessageType.CHAT_FILE]: handleChatMessage,
    [ImTypes.MessageType.CHAT_VIDEO]: handleChatMessage,
    [ImTypes.MessageType.CHAT_AUDIO]: handleChatMessage,
    [ImTypes.MessageType.GROUP_IMAGE]: handleChatMessage,
    [ImTypes.MessageType.GROUP_FILE]: handleChatMessage,
    [ImTypes.MessageType.GROUP_VIDEO]: handleChatMessage,
    [ImTypes.MessageType.GROUP_AUDIO]: handleChatMessage,
    [ImTypes.MessageType.GROUP_TEXT]: handleChatMessage,


    [ImTypes.MessageType.FRIEND_REQUEST]: handleNotification,
    [ImTypes.MessageType.FRIEND_ADD]: handleNotification,
    [ImTypes.MessageType.FRIEND_DELETED]: handleNotification,
    [ImTypes.MessageType.GROUP_REQUEST]: handleNotification,
    // 群操作、消息撤回等统一为 NOTIFICATION 信封（NotifyMessage），
    // 由 wsNotificationListener 按 oneof body 分派
    [ImTypes.MessageType.GROUP_OP_NOTIFICATION]: handleNotification,
    [ImTypes.MessageType.USER_KICKOFF]: handleNotification,


    [ImTypes.MessageType.MSG_ACK]: handleMsgAck,
    [ImTypes.MessageType.MSG_PERSIST_ACK]: handleMsgPersistAck,

    [ImTypes.MessageType.MSG_RECALL]: handleMessageRecall,
    [ImTypes.MessageType.USER_OFFLINE]: handleOfflineNotify,
    [ImTypes.MessageType.ERROR]: handleErrorMessage,
};

/**
 * Initialize all routes
 */
export function setupRoutes(): void {
    messageRouter.registerRoutes(wsRouteTable);
}

/**
 * Helper to add a custom route at runtime
 */
export function addRoute(type: number, handler: MessageHandler): void {
    messageRouter.register(type, handler);
}
