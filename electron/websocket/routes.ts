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

/**
 * 通话信令（800-809）：原样广播到所有窗口。
 *
 * 不在主进程解码：主进程不需要理解信令语义，解码成本白花。
 * 广播而非定向的原因——主窗口负责拉起通话窗（收 CALL_INVITE / CALL_PENDING），
 * 通话窗自行消费 SDP/ICE/END，两个渲染进程各取所需。
 */
const handleCallSignal: MessageHandler = async (message: WsMessage) => {
    try {
        windowManager.broadcastMessage(IpcChannels.WS_CALL_SIGNAL, {
            type: message.type,
            payload: message.payload,
            timestamp: message.timestamp,
            senderId: message.senderId,
        });
    } catch (e) {
        console.error('[Routes] Failed to forward call signal', e);
    }
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
    // 通话记录：终态时由服务端铸造的普通聊天消息，走常规链路（含未读累计）
    [ImTypes.MessageType.CHAT_CALL]: handleChatMessage,
    [ImTypes.MessageType.GROUP_IMAGE]: handleChatMessage,
    [ImTypes.MessageType.GROUP_FILE]: handleChatMessage,
    [ImTypes.MessageType.GROUP_VIDEO]: handleChatMessage,
    [ImTypes.MessageType.GROUP_AUDIO]: handleChatMessage,
    [ImTypes.MessageType.GROUP_TEXT]: handleChatMessage,


    [ImTypes.MessageType.FRIEND_REQUEST]: handleNotification,
    [ImTypes.MessageType.FRIEND_ADD]: handleNotification,
    [ImTypes.MessageType.FRIEND_DELETED]: handleNotification,
    [ImTypes.MessageType.GROUP_REQUEST]: handleNotification,
    [ImTypes.MessageType.GROUP_INVITE]: handleNotification,
    // 群操作、消息撤回等统一为 NOTIFICATION 信封（NotifyMessage），
    // 由 wsNotificationListener 按 oneof body 分派。
    // 注意：服务端扇出的 WSMessage.Type 原样携带落库 MsgType——撤回通知是
    // MSG_OP_RECALL(605) 而非 GROUP_OP_NOTIFICATION(606)，两者都必须注册
    [ImTypes.MessageType.GROUP_OP_NOTIFICATION]: handleNotification,
    [ImTypes.MessageType.MSG_OP_RECALL]: handleNotification,
    [ImTypes.MessageType.USER_KICKOFF]: handleNotification,


    [ImTypes.MessageType.MSG_ACK]: handleMsgAck,
    [ImTypes.MessageType.MSG_PERSIST_ACK]: handleMsgPersistAck,

    // 通话信令 800-809：十个类型一个都不能少，漏一处就是整条链路死代码
    [ImTypes.MessageType.CALL_INVITE]: handleCallSignal,
    [ImTypes.MessageType.CALL_ACCEPT]: handleCallSignal,
    [ImTypes.MessageType.CALL_REJECT]: handleCallSignal,
    [ImTypes.MessageType.CALL_CANCEL]: handleCallSignal,
    [ImTypes.MessageType.CALL_HANGUP]: handleCallSignal,
    [ImTypes.MessageType.CALL_SDP]: handleCallSignal,
    [ImTypes.MessageType.CALL_ICE]: handleCallSignal,
    [ImTypes.MessageType.CALL_PENDING]: handleCallSignal,
    [ImTypes.MessageType.CALL_MEDIA_UPDATE]: handleCallSignal,
    [ImTypes.MessageType.CALL_END]: handleCallSignal,

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
