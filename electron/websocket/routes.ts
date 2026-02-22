import { WsMessage } from './serializer/MessageSerializer';
import { messageRouter, MessageHandler } from './MessageRouter';
import { windowManager } from '../windows/windowManager';
import { IpcChannels, ImTypes } from '../../src/types';

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
const handleTextMessage: MessageHandler = async (message: WsMessage) => {
    try {
        const payload = message.payload instanceof Uint8Array
            ? ImTypes.TextMessage.decode(message.payload)
            : message.payload; // Fallback if already decoded or not bytes

        console.log('[Routes] Received text message:', payload);

        // Broadcast to all renderer windows
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
                // Assuming msg_id in MessageAck corresponds to the client_id we sent
                messageQueue.acknowledge(ack.client_id);
                windowManager.broadcastMessage(IpcChannels.WS_MESSAGE_ACK, ack);
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
const handleFriendRequest: MessageHandler = async (message: WsMessage) => {
    try {
        const payload = message.payload instanceof Uint8Array
            ? ImTypes.FriendRequest.decode(message.payload)
            : message.payload;

        console.log('[Routes] Received friend request:', payload);

        // Broadcast to renderers
        windowManager.broadcastMessage(IpcChannels.WS_MESSAGE, {
            type: message.type,
            payload: payload,
            timestamp: message.timestamp,
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
    windowManager.broadcastMessage('ws:offline-notify', {
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
    [ImTypes.MessageType.CHAT_TEXT]: handleTextMessage,
    [ImTypes.MessageType.FRIEND_REQUEST]: handleFriendRequest,
    [ImTypes.MessageType.MSG_RECALL]: handleMessageRecall,
    [ImTypes.MessageType.USER_OFFLINE]: handleOfflineNotify,
    [ImTypes.MessageType.ERROR]: handleErrorMessage,

    [ImTypes.MessageType.MSG_ACK]: handleMsgAck,
};

/**
 * Initialize all routes
 */
export function setupRoutes(): void {
    messageRouter.registerRoutes(wsRouteTable);
    console.log('[Routes] Registered routes:', messageRouter.getRegisteredTypes());
}

/**
 * Helper to add a custom route at runtime
 */
export function addRoute(type: number, handler: MessageHandler): void {
    messageRouter.register(type, handler);
}
