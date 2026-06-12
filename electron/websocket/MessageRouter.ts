import { WsMessage } from './serializer/MessageSerializer';
import { ImTypes } from '@/src/types'; // Correct path

/**
 * Message handler function type
 */
export type MessageHandler = (message: WsMessage) => void | Promise<void>;

/**
 * Route definition for a message type
 */
export interface RouteDefinition {
    handler: MessageHandler;
    description?: string;
}

/**
 * Message router for dispatching messages by type
 * Supports dynamic registration for extensibility
 */
export class MessageRouter {
    private routes: Map<ImTypes.MessageType, RouteDefinition[]> = new Map();

    /**
     * Register a handler for a message type
     * Multiple handlers can be registered for the same type
     */
    register(type: ImTypes.MessageType, handler: MessageHandler, description?: string): void {
        const existing = this.routes.get(type) || [];
        existing.push({ handler, description });
        this.routes.set(type, existing);
    }

    /**
     * Register multiple routes at once from a route table
     */
    registerRoutes(routeTable: Record<number, MessageHandler>): void {
        for (const [type, handler] of Object.entries(routeTable)) {
            // Object.entries converts keys to strings, need to parse back to number
            this.register(Number(type) as ImTypes.MessageType, handler);
        }
    }

    /**
     * Unregister all handlers for a message type
     */
    unregister(type: ImTypes.MessageType): void {
        this.routes.delete(type);
    }

    /**
     * Dispatch a message to all registered handlers
     */
    async dispatch(message: WsMessage): Promise<boolean> {
        if (message.type === null || message.type === undefined) return false;

        const handlers = this.routes.get(message.type);

        if (!handlers || handlers.length === 0) {
            console.warn(`[MessageRouter] No handler registered for type: ${message.type}`);
            return false;
        }

        for (const route of handlers) {
            try {
                await route.handler(message);
            } catch (error) {
                console.error(`[MessageRouter] Handler error for type ${message.type}:`, error);
            }
        }

        return true;
    }

    /**
     * Check if a handler exists for a message type
     */
    hasHandler(type: number): boolean {
        const handlers = this.routes.get(type);
        return handlers !== undefined && handlers.length > 0;
    }

    /**
     * Get all registered message types
     */
    getRegisteredTypes(): number[] {
        return Array.from(this.routes.keys());
    }

    /**
     * Clear all routes
     */
    clear(): void {
        this.routes.clear();
    }
}

export const messageRouter = new MessageRouter();
