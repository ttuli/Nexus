import { IChatMessage } from '@/types/chatMessage';
import { MessageStatus } from '@/types/proto';

interface ChatMessageRecord {
    pk: string;
    sessionId: string;
    msgId: string;
    clientId: string;
    sendTime: number;
    seq: number;
    message: IChatMessage;
    updatedAt: number;
}

class MessageStorageService {
    private readonly dbName = 'imchat';
    private readonly dbVersion = 1;
    private readonly storeName = 'chat_messages';
    private dbPromise: Promise<IDBDatabase> | null = null;

    private openDB(): Promise<IDBDatabase> {
        if (this.dbPromise) return this.dbPromise;
        if (typeof indexedDB === 'undefined') {
            return Promise.reject(new Error('IndexedDB is not available in current environment'));
        }

        this.dbPromise = new Promise((resolve, reject) => {
            const req = indexedDB.open(this.dbName, this.dbVersion);

            req.onupgradeneeded = () => {
                const db = req.result;
                let store: IDBObjectStore;

                if (!db.objectStoreNames.contains(this.storeName)) {
                    store = db.createObjectStore(this.storeName, { keyPath: 'pk' });
                } else {
                    store = req.transaction!.objectStore(this.storeName);
                }

                if (!store.indexNames.contains('session_sendTime')) {
                    store.createIndex('session_sendTime', ['sessionId', 'sendTime'], { unique: false });
                }
                if (!store.indexNames.contains('session_msgId')) {
                    store.createIndex('session_msgId', ['sessionId', 'msgId'], { unique: false });
                }
                if (!store.indexNames.contains('session_clientId')) {
                    store.createIndex('session_clientId', ['sessionId', 'clientId'], { unique: false });
                }
            };

            req.onsuccess = () => {
                const db = req.result;
                db.onversionchange = () => db.close();
                resolve(db);
            };
            req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB'));
        });

        return this.dbPromise;
    }

    private requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
        });
    }

    private txDone(tx: IDBTransaction): Promise<void> {
        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
            tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
        });
    }

    private buildPk(message: IChatMessage): string {
        if (message.msgId) return `msg:${message.sessionId}:${message.msgId}`;
        if (message.clientId) return `cid:${message.sessionId}:${message.clientId}`;
        return `tmp:${message.sessionId}:${message.sendTime}:${message.seq}:${Math.random().toString(36).slice(2, 10)}`;
    }

    private async findExistingPk(
        store: IDBObjectStore,
        sessionId: string,
        msgId: string,
        clientId: string
    ): Promise<string | null> {
        if (msgId) {
            const idx = store.index('session_msgId');
            const cursorReq = idx.openCursor(IDBKeyRange.only([sessionId, msgId]));
            const cursor = await this.requestToPromise(cursorReq);
            if (cursor) {
                return (cursor as IDBCursorWithValue).value.pk as string;
            }
        }

        if (clientId) {
            const idx = store.index('session_clientId');
            const cursorReq = idx.openCursor(IDBKeyRange.only([sessionId, clientId]));
            const cursor = await this.requestToPromise(cursorReq);
            if (cursor) {
                return (cursor as IDBCursorWithValue).value.pk as string;
            }
        }

        return null;
    }

    private toStorableValue(value: unknown, seen: WeakSet<object>): unknown {
        if (value === null || value === undefined) return value;

        const valueType = typeof value;
        if (valueType === 'string' || valueType === 'number' || valueType === 'boolean') {
            return value;
        }
        if (valueType === 'bigint') {
            return value.toString();
        }
        if (valueType === 'function' || valueType === 'symbol') {
            return undefined;
        }

        if (value instanceof Date) {
            return value.toISOString();
        }

        if (value instanceof ArrayBuffer) {
            return value.slice(0);
        }

        if (ArrayBuffer.isView(value)) {
            return value;
        }

        if (typeof value === 'object') {
            const obj = value as Record<string, unknown>;
            if (seen.has(obj)) {
                return undefined;
            }
            seen.add(obj);

            if (Array.isArray(obj)) {
                return obj.map((item) => this.toStorableValue(item, seen));
            }

            const plain: Record<string, unknown> = {};
            for (const [key, item] of Object.entries(obj)) {
                const converted = this.toStorableValue(item, seen);
                if (converted !== undefined) {
                    plain[key] = converted;
                }
            }
            return plain;
        }

        return undefined;
    }

    private toStorableMessage(message: IChatMessage): IChatMessage {
        const cloned = this.toStorableValue(message, new WeakSet<object>());
        return (cloned ?? {}) as IChatMessage;
    }

    async saveMessage(message: IChatMessage): Promise<void> {
        if (!message?.sessionId) return;

        const db = await this.openDB();
        const tx = db.transaction(this.storeName, 'readwrite');
        const store = tx.objectStore(this.storeName);

        try {
            const sessionId = message.sessionId;
            const msgId = message.msgId || '';
            const clientId = message.clientId || '';
            const existingPk = await this.findExistingPk(store, sessionId, msgId, clientId);
            const pk = existingPk ?? this.buildPk(message);

            const record: ChatMessageRecord = {
                pk,
                sessionId,
                msgId,
                clientId,
                sendTime: Number(message.sendTime) || Date.now(),
                seq: Number(message.seq) || 0,
                message: this.toStorableMessage(message),
                updatedAt: Date.now(),
            };

            await this.requestToPromise(store.put(record));
            await this.txDone(tx);
        } catch (error) {
            try {
                tx.abort();
            } catch {
                // no-op
            }
            throw error;
        }
    }

    async saveMessages(messages: IChatMessage[]): Promise<void> {
        if (!messages.length) return;
        for (const message of messages) {
            await this.saveMessage(message);
        }
    }

    async updateMessageStatus(sessionId: string, clientId: string, status: MessageStatus, msgId?: string): Promise<void> {
        if (!sessionId || (!clientId && !msgId)) return;

        const db = await this.openDB();
        const tx = db.transaction(this.storeName, 'readwrite');
        const store = tx.objectStore(this.storeName);

        const tryUpdate = async (idxName: 'session_clientId' | 'session_msgId', idxKey: [string, string]) => {
            const idx = store.index(idxName);
            const cursorReq = idx.openCursor(IDBKeyRange.only(idxKey));
            const cursor = await this.requestToPromise(cursorReq);
            if (!cursor) return false;
            const row = (cursor as IDBCursorWithValue).value as ChatMessageRecord;
            row.message.status = status;
            row.updatedAt = Date.now();
            await this.requestToPromise(store.put(row));
            return true;
        };

        try {
            let updated = false;
            if (clientId) {
                updated = await tryUpdate('session_clientId', [sessionId, clientId]);
            }
            if (!updated && msgId) {
                await tryUpdate('session_msgId', [sessionId, msgId]);
            }
            await this.txDone(tx);
        } catch (error) {
            try {
                tx.abort();
            } catch {
                // no-op
            }
            throw error;
        }
    }

    async getLocalHistoryMessages(
        sessionId: string,
        upper: number,
        pageSize: number
    ): Promise<IChatMessage[]> {
        if (!sessionId || pageSize <= 0) return [];
        const db = await this.openDB();

        return new Promise<IChatMessage[]>((resolve, reject) => {
            const tx = db.transaction(this.storeName, 'readonly');
            const store = tx.objectStore(this.storeName);
            const idx = store.index('session_sendTime');

            const range = IDBKeyRange.bound([sessionId, 0], [sessionId, upper], false, false);
            const req = idx.openCursor(range, 'prev');
            const rows: ChatMessageRecord[] = [];

            req.onsuccess = () => {
                const cursorVal = req.result as IDBCursorWithValue | null;
                if (!cursorVal) return;

                rows.push(cursorVal.value as ChatMessageRecord);
                if (rows.length < pageSize) {
                    cursorVal.continue();
                }
            };

            req.onerror = () => reject(req.error ?? new Error('Failed to read history messages'));
            tx.onerror = () => reject(tx.error ?? new Error('Failed to read history messages'));
            tx.onabort = () => reject(tx.error ?? new Error('Failed to read history messages'));
            tx.oncomplete = () => {
                resolve(rows.reverse().map(row => row.message));
            };
        });
    }

    async clearMessagesBySessionId(sessionId: string): Promise<void> {
        if (!sessionId) return;
        const db = await this.openDB();
        const tx = db.transaction(this.storeName, 'readwrite');
        const store = tx.objectStore(this.storeName);
        const idx = store.index('session_sendTime');

        const range = IDBKeyRange.bound([sessionId, 0], [sessionId, Number.MAX_SAFE_INTEGER], false, false);
        const req = idx.openCursor(range);

        return new Promise((resolve, reject) => {
            req.onsuccess = () => {
                const cursor = req.result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                } else {
                    resolve();
                }
            };
            req.onerror = () => reject(req.error ?? new Error('Failed to clear messages'));
            tx.onerror = () => reject(tx.error ?? new Error('Failed to complete clear transaction'));
        });
    }

    async updateMessageLocalPath(sessionId: string, clientId: string, msgId: string, localPath: string): Promise<void> {
        if (!sessionId || (!clientId && !msgId)) return;

        const db = await this.openDB();
        const tx = db.transaction(this.storeName, 'readwrite');
        const store = tx.objectStore(this.storeName);

        const tryUpdate = async (idxName: 'session_clientId' | 'session_msgId', idxKey: [string, string]) => {
            const idx = store.index(idxName);
            const cursorReq = idx.openCursor(IDBKeyRange.only(idxKey));
            const cursor = await this.requestToPromise(cursorReq);
            if (!cursor) return false;
            const row = (cursor as IDBCursorWithValue).value as ChatMessageRecord;
            (row.message as any).localPath = localPath;
            row.updatedAt = Date.now();
            await this.requestToPromise(store.put(row));
            return true;
        };

        try {
            if (clientId) {
                await tryUpdate('session_clientId', [sessionId, clientId]);
            } else if (msgId) {
                await tryUpdate('session_msgId', [sessionId, msgId]);
            }
            await this.txDone(tx);
        } catch (error) {
            try { tx.abort(); } catch { }
            throw error;
        }
    }
}

export const messageStorageService = new MessageStorageService();
