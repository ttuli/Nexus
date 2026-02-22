/**
 * WebSocket Module Entry Point
 * 
 * This module provides WebSocket communication with features:
 * - Auto-reconnect with exponential backoff
 * - Heartbeat keep-alive
 * - Connection state management
 * - Offline message caching
 * - Message deduplication
 * - Message acknowledgment (ACK)
 * - Extensible serialization (JSON, future protobuf)
 * - Message routing
 */

export { wsManager, WebSocketManager } from './WebSocketManager';
export { defaultSerializer } from './serializer/protoSerializer';
export type { WsMessage, IMessageSerializer } from './serializer/MessageSerializer';
export { messageQueue, MessageQueue } from './MessageQueue';
export { messageRouter, MessageRouter } from './MessageRouter';
export type { MessageHandler } from './MessageRouter';
export { WsMessageType, wsRouteTable, setupRoutes, addRoute } from './routes';
export { setupWsIpcHandlers, setupWsEventForwarding } from './ipcHandlers';
