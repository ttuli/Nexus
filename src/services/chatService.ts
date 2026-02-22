import { getHistory } from '@/apis/message';
import { ApiTypes, PartialExcept } from '@/types';
import { FileType, MessageStatus, MessageType } from '@/types/im';
import { IChatMessage } from '@/types/chatMessage';

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

class ChatService {
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

    private normalizeCursor(cursor?: string | number): number | undefined {
        if (typeof cursor === 'number') return Number.isNaN(cursor) ? undefined : cursor;
        if (typeof cursor === 'string') {
            const parsed = parseInt(cursor, 10);
            return Number.isNaN(parsed) ? undefined : parsed;
        }
        return undefined;
    }

    private normalizeNumber(value: unknown): number {
        if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
        if (typeof value === 'string') {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : 0;
        }
        return 0;
    }

    private parseExtra(extraRaw: string): Record<string, unknown> {
        if (!extraRaw) return {};
        try {
            const parsed = JSON.parse(extraRaw);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
            return parsed as Record<string, unknown>;
        } catch {
            return {};
        }
    }

    private toStringMap(value: unknown): Record<string, string> | undefined {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
        const obj = value as Record<string, unknown>;
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(obj)) {
            out[k] = String(v ?? '');
        }
        return Object.keys(out).length > 0 ? out : undefined;
    }

    private mapApiMessage(message: ApiTypes.message.Message): IChatMessage | null {
        const extra = this.parseExtra(message.extra);
        const type = this.normalizeNumber(message.msg_type) as MessageType;
        const status = this.normalizeNumber(message.status) as MessageStatus;

        const common = {
            msgId: message.msg_id || '',
            sessionId: message.conversation_id || '',
            fromUserId: this.normalizeNumber(message.from_user_id),
            sendTime: this.normalizeNumber(message.create_time) || Date.now(),
            seq: this.normalizeNumber(message.seq),
            status: status || MessageStatus.MESSAGE_STATUS_UNSPECIFIED,
            isRead: false,
            clientId: message.client_id || '',
            ext: this.toStringMap(extra.ext),
        };

        if (type === MessageType.CHAT_TEXT || type === MessageType.GROUP_TEXT) {
            const atList = Array.isArray(extra.at_list) ? extra.at_list : [];
            return {
                ...common,
                type,
                content: message.content || '',
                atList: atList as any[],
            };
        }

        if (type === MessageType.CHAT_IMAGE || type === MessageType.GROUP_IMAGE) {
            return {
                ...common,
                type,
                url: message.media_url || message.content || '',
                thumbnailUrl: typeof extra.thumbnail_url === 'string' ? extra.thumbnail_url : undefined,
                width: this.normalizeNumber(extra.width),
                height: this.normalizeNumber(extra.height),
                size: this.normalizeNumber(extra.size),
                format: typeof extra.format === 'string' ? extra.format : '',
            };
        }

        if (type === MessageType.CHAT_VIDEO || type === MessageType.GROUP_VIDEO) {
            return {
                ...common,
                type,
                url: message.media_url || message.content || '',
                thumbnailUrl: typeof extra.thumbnail_url === 'string' ? extra.thumbnail_url : undefined,
                duration: this.normalizeNumber(extra.duration),
                width: this.normalizeNumber(extra.width),
                height: this.normalizeNumber(extra.height),
                size: this.normalizeNumber(extra.size),
                format: typeof extra.format === 'string' ? extra.format : '',
            };
        }

        if (type === MessageType.CHAT_FILE || type === MessageType.GROUP_FILE) {
            const extraFileType = this.normalizeNumber(extra.file_type ?? extra.fileType);
            return {
                ...common,
                type,
                url: message.media_url || '',
                fileName: typeof extra.file_name === 'string'
                    ? extra.file_name
                    : typeof extra.fileName === 'string'
                        ? extra.fileName
                        : message.content || '',
                size: this.normalizeNumber(extra.size),
                fileType: extraFileType || FileType.FILE_TYPE_UNSPECIFIED,
            };
        }

        return null;
    }

    private async fetchHistoryFromApi(
        sessionId: string,
        pageSize: number,
        range?: { startSeq?: number; endSeq?: number }
    ): Promise<IChatMessage[]> {
        const params: PartialExcept<ApiTypes.message.GetHistoryReq, 'conversation_id'> = {
            conversation_id: sessionId,
            limit: pageSize,
        };

        const startSeq = this.normalizeNumber(range?.startSeq);
        const endSeq = this.normalizeNumber(range?.endSeq);
        if (startSeq > 0) {
            params.start_seq = startSeq;
        }
        if (endSeq > 0) {
            params.end_seq = endSeq;
        }

        const resp = await getHistory(params);
        const list: ApiTypes.message.Message[] = Array.isArray(resp.data?.list) ? resp.data.list : [];
        let messages = list
            .map((item: ApiTypes.message.Message) => this.mapApiMessage(item))
            .filter((item: IChatMessage | null): item is IChatMessage => item !== null);

        if (startSeq > 0 || endSeq > 0) {
            messages = messages.filter((item) => {
                const seq = this.normalizeNumber(item.seq);
                if (seq <= 0) return true;
                if (startSeq > 0 && seq < startSeq) return false;
                if (endSeq > 0 && seq > endSeq) return false;
                return true;
            });
        }

        messages.sort((a, b) => {
            const seqA = this.normalizeNumber(a.seq);
            const seqB = this.normalizeNumber(b.seq);
            if (seqA > 0 && seqB > 0 && seqA !== seqB) return seqA - seqB;

            const timeA = this.normalizeNumber(a.sendTime);
            const timeB = this.normalizeNumber(b.sendTime);
            if (timeA !== timeB) return timeA - timeB;

            const keyA = `${a.msgId || ''}-${a.clientId || ''}`;
            const keyB = `${b.msgId || ''}-${b.clientId || ''}`;
            return keyA.localeCompare(keyB);
        });

        if (messages.length > 0) {
            await this.saveMessages(messages);
        }

        return messages;
    }

    async getMessagesBySeqRange(
        sessionId: string,
        startSeq: number,
        endSeq: number,
        pageSize: number = 200
    ): Promise<IChatMessage[]> {
        const start = this.normalizeNumber(startSeq);
        const end = this.normalizeNumber(endSeq);
        if (!sessionId || start <= 0 || end <= 0 || start > end || pageSize <= 0) {
            return [];
        }

        return this.fetchHistoryFromApi(sessionId, pageSize, { startSeq: start, endSeq: end });
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
                message: { ...message },
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

    async updateMessageStatus(sessionId: string, clientId: string, status: MessageStatus): Promise<void> {
        if (!sessionId || !clientId) return;

        const db = await this.openDB();
        const tx = db.transaction(this.storeName, 'readwrite');
        const store = tx.objectStore(this.storeName);
        const idx = store.index('session_clientId');

        try {
            const cursorReq = idx.openCursor(IDBKeyRange.only([sessionId, clientId]));
            const cursor = await this.requestToPromise(cursorReq);
            if (!cursor) {
                await this.txDone(tx);
                return;
            }

            const row = (cursor as IDBCursorWithValue).value as ChatMessageRecord;
            row.message.status = status;
            row.updatedAt = Date.now();
            await this.requestToPromise(store.put(row));
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

    /**
     * Get history messages for a session.
     * @param sessionId The session ID to fetch messages for.
     * @param cursor The message timestamp used as an exclusive upper bound.
     * @param pageSize Number of messages to fetch.
     * @param cursorSeq Message sequence cursor from current oldest loaded message.
     */
    async getHistoryMessages(
        sessionId: string,
        cursor?: string | number,
        pageSize: number = 20,
        cursorSeq?: string | number
    ): Promise<IChatMessage[]> {
        if (!sessionId || pageSize <= 0) return [];

        const beforeSeq = this.normalizeCursor(cursorSeq);
        const beforeTime = this.normalizeCursor(cursor);
        const upper = beforeTime !== undefined ? beforeTime - 1 : Number.MAX_SAFE_INTEGER;
        if (upper < 0) return [];

        // If we already have local messages but the oldest one has no seq,
        // fallback to server history API (seq-based cursor source).
        if (cursor !== undefined && beforeSeq === undefined) {
            const remote = await this.fetchHistoryFromApi(sessionId, pageSize);
            if (beforeTime === undefined) return remote;
            return remote.filter(item => this.normalizeNumber(item.sendTime) < beforeTime);
        }

        const db = await this.openDB();

        const local = await new Promise<IChatMessage[]>((resolve, reject) => {
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

        if (local.length > 0) {
            return local;
        }

        const endSeq = beforeSeq !== undefined && beforeSeq > 0 ? beforeSeq - 1 : undefined;
        const startSeq = endSeq !== undefined && endSeq > 0
            ? Math.max(1, endSeq - pageSize + 1)
            : undefined;
        const remote = await this.fetchHistoryFromApi(sessionId, pageSize, { startSeq, endSeq });
        if (endSeq !== undefined && endSeq > 0) {
            return remote;
        }
        if (beforeTime === undefined) {
            return remote;
        }
        return remote.filter(item => this.normalizeNumber(item.sendTime) < beforeTime);
    }
}

export const chatService = new ChatService();
