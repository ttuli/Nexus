import { WsMessage } from './serializer/MessageSerializer';
import { ImTypes } from '@shared/types';
import { Main_Config as config } from '@shared/config/constants';
import { EventEmitter } from 'events';

interface PendingMessage {
    message: WsMessage;
    retries: number;
    timestamp: number;
}

function shouldRequireAck(type?: ImTypes.MessageType | null): boolean {
    if (!type) return false;
    return (type >= 100 && type < 300);
}

/**
 * Message queue for offline caching, deduplication, and ACK tracking
 */
export class MessageQueue extends EventEmitter {
    // Messages waiting to be sent (offline queue)
    private pendingMessages: Map<string, PendingMessage> = new Map();

    // Messages sent but not yet acknowledged
    private unacknowledgedMessages: Map<string, PendingMessage> = new Map();

    // Set of recently received message IDs for deduplication
    private receivedMessageIds: Set<string> = new Set();

    // Dedup window
    private readonly DEDUP_WINDOW_MS = config.messageQueue.dedupWindowMs;

    // Max retries
    private readonly MAX_RETRIES = config.messageQueue.maxRetries;

    // Polling interval
    private checkInterval: NodeJS.Timeout | null = null;
    private readonly CHECK_INTERVAL_MS = config.messageQueue.checkIntervalMs;

    constructor() {
        super();
        this.startChecking();
    }

    /**
     * Start polling for timeouts
     */
    private startChecking() {
        if (this.checkInterval) return;
        this.checkInterval = setInterval(() => {
            this.checkTimeouts();
        }, this.CHECK_INTERVAL_MS);
    }

    /**
     * Stop polling
     */
    public stopChecking() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
    }

    /**
     * Check for timed out messages
     */
    private checkTimeouts() {
        const now = Date.now();
        const timeoutMs = config.messageQueue.msgTimeoutMs;

        for (const [id, pending] of this.unacknowledgedMessages) {
            if (now - pending.timestamp > timeoutMs) {
                if (pending.retries < this.MAX_RETRIES) {
                    pending.retries += 1;
                    pending.timestamp = now;
                    console.log(`[MessageQueue] Retrying message ${id}, attempt ${pending.retries}`);
                    this.emit('retry', pending.message);
                } else {
                    this.unacknowledgedMessages.delete(id);
                    console.warn(`[MessageQueue] Message ${id} failed after max retries`);
                    this.emit('fail', {
                        client_id: id,
                        session_id: pending.message.sessionId || '',
                        session_key: pending.message.sessionKey || '',
                        status: ImTypes.AckStatus.ACK_STATUS_FAILED,
                        msg_id: pending.message.msgId || '',
                        seq: pending.message.seq || 0,
                        error_msg: ''
                    });
                }
            }
        }
    }

    /**
     * Add a message to the pending queue (for offline sending)
     */
    enqueue(msg: WsMessage): void {
        if (!msg.clientId || this.pendingMessages.has(msg.clientId) || this.unacknowledgedMessages.has(msg.clientId)) {
            return; // Already queued or waiting for ACK
        }
        this.pendingMessages.set(msg.clientId, {
            message: msg,
            retries: 0,
            timestamp: Date.now(),
        });
    }

    /**
     * Get all pending messages and move them to unacknowledged if they require ACK
     */
    flushPending(): { msg: WsMessage; clientId: string }[] {
        const messages: { msg: WsMessage; clientId: string }[] = [];
        for (const [id, pending] of this.pendingMessages) {
            messages.push({ msg: pending.message, clientId: id });
            if (shouldRequireAck(pending.message.type)) {
                this.unacknowledgedMessages.set(id, pending);
            }
        }
        this.pendingMessages.clear();
        return messages;
    }

    acknowledge(clientId: string | number): boolean {
        if (!clientId) return false;
        const key = String(clientId);
        const deleted = this.unacknowledgedMessages.delete(key);
        if (deleted) {
            console.log(`[MessageQueue] Message ${key} acknowledged, removed from retry queue`);
        }
        return deleted;
    }

    /**
     * Check if a message has been received recently (for deduplication)
     */
    isDuplicate(msgId: string | null | undefined): boolean {
        if (!msgId) return false;
        return this.receivedMessageIds.has(msgId);
    }

    /**
     * Mark a message as received
     */
    markReceived(msgId: string | null | undefined): void {
        if (!msgId) return;
        this.receivedMessageIds.add(msgId);

        // Schedule cleanup after dedup window
        setTimeout(() => {
            this.receivedMessageIds.delete(msgId);
        }, this.DEDUP_WINDOW_MS);
    }

    /**
     * Get pending message count
     */
    getPendingCount(): number {
        return this.pendingMessages.size;
    }

    /**
     * Get unacknowledged message count
     */
    getUnacknowledgedCount(): number {
        return this.unacknowledgedMessages.size;
    }

    /**
     * Clear all queues
     */
    clear(): void {
        this.pendingMessages.clear();
        this.unacknowledgedMessages.clear();
        this.receivedMessageIds.clear();
    }
}

export const messageQueue = new MessageQueue();
