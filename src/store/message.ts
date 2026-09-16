import { defineStore } from 'pinia';
import { useSessionStore } from './session';
import { IChatMessage } from '@shared/types/chatMessage';
import { Renderer_Config } from '@shared/config/constants';
import { seqPositive, toSeq, seqCompare } from '@shared/utils/seq';

// ─── Dependency Injection Interfaces ─────────────────────────────────────────
// Store 不直接依赖任何 Service；历史拉取能力通过接口在调用方（composable）注入。
// 发送 / 上传 / 落库编排已上移至 composable 层，store 仅保留同步状态 mutation。

/**
 * 历史消息页：可立即返回的 messages + 可选的后台补齐承诺。
 * reconcile resolve 为补齐后的完整页，由 store 负责并入（service 不触碰 store）。
 */
export interface HistoryPage {
    messages: IChatMessage[]
    reconcile?: Promise<IChatMessage[]>
}

/** 历史消息拉取能力 */
export interface IHistoryFetcher {
    getHistoryMessages(
        sessionKey: string,
        beforeSeq?: string,
        limit?: number,
        sessionMaxSeq?: string,
    ): Promise<HistoryPage>
}

export const useMessageStore = defineStore('message', {
    state: () => ({
        messages: [] as IChatMessage[],
        isLoading: false,
        hasMore: true,
        pageSize: 20,
        /**
         * 会话消息内存缓存：切换会话时暂存当前列表，切回时直接恢复免于重新查库。
         * Map 迭代序即插入序，用作 LRU：命中/写入时先删后插移至队尾，超限淘汰队首。
         */
        sessionMessageCache: new Map<string, { messages: IChatMessage[]; hasMore: boolean }>(),
    }),
    actions: {
        /**
         * 将当前会话的消息列表暂存入缓存（切换会话前调用）
         */
        stashCurrentMessages(sessionKey: string) {
            if (!sessionKey) return;
            if (this.messages.length === 0) {
                this.sessionMessageCache.delete(sessionKey);
                return;
            }
            this.sessionMessageCache.delete(sessionKey);
            this.sessionMessageCache.set(sessionKey, { messages: this.messages, hasMore: this.hasMore });
            while (this.sessionMessageCache.size > Renderer_Config.maxCachedMessageSessions) {
                const oldest = this.sessionMessageCache.keys().next().value;
                if (oldest === undefined) break;
                this.sessionMessageCache.delete(oldest);
            }
        },

        /**
         * 尝试从缓存恢复会话消息，命中返回 true（未命中时由调用方走 reset + 查库流程）
         */
        restoreMessagesFromCache(sessionKey: string): boolean {
            const cached = this.sessionMessageCache.get(sessionKey);
            if (!cached) return false;
            // 刷新 LRU 顺序
            this.sessionMessageCache.delete(sessionKey);
            this.sessionMessageCache.set(sessionKey, cached);
            this.messages = cached.messages;
            this.hasMore = cached.hasMore;
            this.isLoading = false;
            return true;
        },

        /**
         * 失效指定会话的消息缓存
         * （离线补拉绕过内存写库、退群清理等使缓存过期的场景调用）
         */
        invalidateMessageCache(sessionKey: string) {
            this.sessionMessageCache.delete(sessionKey);
        },

        /**
         * 清空全部消息缓存（离开主界面/登出时调用）
         */
        clearMessageCache() {
            this.sessionMessageCache.clear();
        },

        /**
         * 清除指定会话的消息缓存
         */
        clearSessionMessage(session_key: string) {
            if (this.sessionMessageCache.has(session_key)) {
                this.sessionMessageCache.delete(session_key);
            }
            if (this.messages.length && this.messages[0].sessionKey === session_key) {
                this.messages = [];
            }
        },

        /**
         * 更新文件消息的本地路径（下载完成后使用）
         */
        updateFileLocalPath(sessionkey: string, msgId: string, localPath: string) {
            const sessionStore = useSessionStore();
            if (sessionStore.currentSessionKey !== sessionkey) return;
            const msg = this.messages.find(m =>
                (msgId && m.msgId === msgId)
            ) as any;
            if (msg) {
                msg.localPath = localPath;
            }
        },

        /**
         * 重置当前会话消息状态
         */
        resetMessageState() {
            this.messages = [];
            this.isLoading = false;
            this.hasMore = true;
        },

        /**
         * 更新消息状态（供 Listener 更新服务端返回的 ack / recall 状态使用）
         */
        updateMessageStatus(
            _sessionId: string,
            msgId: string | undefined,
            clientId: string | undefined,
            status: number,
            sendTime?: number,
            seq?: string
        ): IChatMessage | undefined {
            const findIn = (list: IChatMessage[]) => list.find(m =>
                (clientId && m.clientId === clientId) ||
                (msgId && m.msgId === msgId)
            );
            let msg = findIn(this.messages);
            if (!msg) {
                // 当前会话未命中：用户可能已切走，ACK/撤回状态仍需落到缓存中的消息上
                for (const cached of this.sessionMessageCache.values()) {
                    msg = findIn(cached.messages);
                    if (msg) break;
                }
            }
            if (msg) {
                msg.status = status;
                if (sendTime) msg.sendTime = sendTime;
                if (msgId) msg.msgId = msgId;
                if (seq && seqPositive(seq)) msg.seq = toSeq(seq);
                if (_sessionId) msg.sessionId = _sessionId;
            }
            return msg;
        },

        /**
         * 从内存中移除一条消息（本地删除）
         *
         * 当前列表与会话缓存都要清：二者在「从缓存恢复」后可能指向同一数组，
         * 但在用户已切走的场景下是两份独立引用，只清一处会导致切回时消息复活。
         *
         * @returns 是否命中并移除
         */
        removeMessage(msgId?: string, clientId?: string): boolean {
            if (!msgId && !clientId) return false;
            const match = (m: IChatMessage) =>
                (clientId && m.clientId === clientId) ||
                (msgId && m.msgId === msgId);

            let removed = false;

            const idx = this.messages.findIndex(match);
            if (idx !== -1) {
                this.messages.splice(idx, 1);
                removed = true;
            }

            for (const cached of this.sessionMessageCache.values()) {
                // 与 this.messages 同引用时上面已删干净，findIndex 自然落空
                const cachedIdx = cached.messages.findIndex(match);
                if (cachedIdx !== -1) {
                    cached.messages.splice(cachedIdx, 1);
                    removed = true;
                }
            }

            return removed;
        },

        /**
         * 添加或更新消息，返回 store 内的消息引用（响应式）
         *
         * messages 数组只承载当前会话：携带 sessionKey 且不属于当前会话的新消息
         * 不入列（异步回调/Listener 到达时用户可能已切换会话），但若该会话有内存
         * 缓存则同步追加进缓存，保证切回时尾部消息不缺失。
         */
        upsertMessage(message: IChatMessage): IChatMessage {
            const existing = this.messages.find(m =>
                (message.clientId && message.clientId === m.clientId) ||
                (message.msgId && message.msgId === m.msgId)
            );
            if (!existing) {
                const sessionStore = useSessionStore();
                if (message.sessionKey && message.sessionKey !== sessionStore.currentSessionKey) {
                    const cached = this.sessionMessageCache.get(message.sessionKey);
                    if (cached) {
                        const cachedExisting = cached.messages.find(m =>
                            (message.clientId && message.clientId === m.clientId) ||
                            (message.msgId && message.msgId === m.msgId)
                        );
                        if (!cachedExisting) cached.messages.push(message);
                    }
                    return message;
                }
                this.messages.push(message);
                return this.messages[this.messages.length - 1];
            } else {
                existing.seq = seqPositive(message.seq) ? toSeq(message.seq) : existing.seq;
                existing.msgId = message.msgId || existing.msgId;
                existing.status = message.status || existing.status;
                existing.sendTime = message.sendTime || existing.sendTime;
                return existing;
            }
        },

        /**
         * 将后台补齐的历史消息并入指定会话（当前列表或内存缓存），按 seq 去重排序。
         * 会话已不在 store（未打开且未缓存）时静默忽略——对应「store 中还有这个会话的 key 才添加」。
         */
        mergeHistoryMessages(sessionKey: string, incoming: IChatMessage[]) {
            if (!sessionKey || incoming.length === 0) return;
            const sessionStore = useSessionStore();
            const target = sessionStore.currentSessionKey === sessionKey
                ? this.messages
                : this.sessionMessageCache.get(sessionKey)?.messages;
            if (!target) return;

            let changed = false;
            for (const msg of incoming) {
                const exists = target.some(m =>
                    (msg.clientId && m.clientId === msg.clientId) ||
                    (msg.msgId && m.msgId === msg.msgId)
                );
                if (!exists) {
                    target.push(msg);
                    changed = true;
                }
            }
            if (!changed) return;

            target.sort((a, b) => {
                if (seqPositive(a.seq) && seqPositive(b.seq)) {
                    const cmp = seqCompare(a.seq, b.seq);
                    if (cmp !== 0) return cmp;
                }
                return (a.sendTime || 0) - (b.sendTime || 0);
            });
        },

        /**
         * 加载更多历史消息
         * @param fetcher  注入的历史消息拉取实现（由调用方传入 chatService）
         */
        async loadMore(sessionKey: string, fetcher: IHistoryFetcher): Promise<IChatMessage[]> {
            if (this.isLoading || !this.hasMore || !sessionKey) return [];

            const oldestConfirmedSeq = (() => {
                for (const msg of this.messages) {
                    if (seqPositive(msg.seq)) return toSeq(msg.seq);
                }
                return undefined;
            })();

            if (this.messages.length > 0 && oldestConfirmedSeq === undefined) {
                this.hasMore = false;
                return [];
            }

            this.isLoading = true;
            try {
                const sessionStore = useSessionStore();
                // 会话 max_seq 由 store 读取后作为入参传入，fetcher（service）不再反向依赖 store
                const maxSeq = sessionStore.getSession(sessionKey)?.max_seq;
                const page = await fetcher.getHistoryMessages(
                    sessionKey,
                    oldestConfirmedSeq,
                    this.pageSize,
                    maxSeq,
                );
                const moreMessages = page.messages;

                if (sessionStore.currentSessionKey !== sessionKey) {
                    return [];
                }

                if (moreMessages.length > 0) {
                    this.messages.unshift(...moreMessages);
                }

                // 本地优先 + 后台补齐策略下，不足一页不代表到顶（可能只是本地这页较小，
                // 更早的由后台/下次翻页补）。仅当整页为空（确无更早消息）时才停止翻页。
                if (moreMessages.length === 0) {
                    this.hasMore = false;
                }

                // 后台补齐承诺 resolve 后由 store 自身并入（会话仍打开/缓存时）——合并逻辑归属 store
                if (page.reconcile) {
                    void page.reconcile.then(fresh => this.mergeHistoryMessages(sessionKey, fresh));
                }

                return moreMessages;
            } catch (e) {
                console.error('[MessageStore] loadMore failed:', e);
                return [];
            } finally {
                const sessionStore = useSessionStore();
                if (sessionStore.currentSessionKey === sessionKey) {
                    this.isLoading = false;
                }
            }
        },
    },
});
