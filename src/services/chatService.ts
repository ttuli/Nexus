import { toRaw } from 'vue';
import { getHistory, getSession, getUserActiveSessions, getUserSessions } from '@/src/apis/message';
import { ApiTypes, ImTypes, PartialExcept, ResourceType, UpdateAction } from '@shared/types';
import { MessageStatus, MessageType } from '@shared/types/proto';
import { IChatMessage } from '@shared/types/chatMessage';
import { toSeq, seqPositive, seqLt, seqGt, seqCompare, seqPlusOne, seqMax } from '@shared/utils/seq';

import { convertNotificationToChatMessage } from '@/src/utils/messageConverter';
import { judgeSessionType, toServerSessionType } from '@/src/utils/sessionUtils';
import { useSessionStore } from '@/src/store/session';
import { useMessageStore } from '@/src/store/message';
import { getOfflineTimestamp } from '@/src/store/init';
import cacheService from './cacheService';
import groupService from './groupService';
import { messageService } from './messageService';
import { sessionService } from './sessionService';

class ChatService {
    // 离线同步在途标记：防止挂载同步与重连同步并发重入
    private offlineSyncInFlight = false;
    // 离线同步取消令牌：登出/离开主界面时中止分页拉取序列
    private offlineSyncAbort: AbortController | null = null;

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

    /**
     * 服务端 extra JSON 中历史遗留 key（以枚举名字面量序列化，如 MESSAGE_EXTRA_KEY_WIDTH）
     * 与新式 key（如 width）并存，按传入顺序取第一个命中的值。
     */
    private extraNumber(extra: Record<string, unknown>, ...keys: string[]): number {
        for (const key of keys) {
            const value = extra[key];
            if (value) return this.normalizeNumber(value);
        }
        return 0;
    }

    private extraString(extra: Record<string, unknown>, ...keys: string[]): string | undefined {
        for (const key of keys) {
            const value = extra[key];
            if (typeof value === 'string') return value;
        }
        return undefined;
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
            sessionId: message.session_id || '',
            fromUserId: this.normalizeNumber(message.from_user_id),
            sendTime: this.normalizeNumber(message.create_time) || Date.now(),
            seq: toSeq(message.seq),
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
                thumbnailUrl: this.extraString(extra, 'thumbnail_url'),
                width: this.extraNumber(extra, 'MESSAGE_EXTRA_KEY_WIDTH', 'width'),
                height: this.extraNumber(extra, 'MESSAGE_EXTRA_KEY_HEIGHT', 'height'),
                thumbnailWidth: this.extraNumber(extra, 'MESSAGE_EXTRA_KEY_THUMB_WIDE', 'thumbnailWidth'),
                thumbnailHeight: this.extraNumber(extra, 'MESSAGE_EXTRA_KEY_THUMB_HEIGHT', 'thumbnailHeight'),
                size: this.extraNumber(extra, 'MESSAGE_EXTRA_KEY_SIZE', 'size'),
                format: this.extraString(extra, 'MESSAGE_EXTRA_KEY_FORMAT', 'format') ?? '',
                fileName: this.extraString(extra, 'MESSAGE_EXTRA_KEY_NAME'),
            };
        }

        if (type === MessageType.CHAT_VIDEO || type === MessageType.GROUP_VIDEO) {
            return {
                ...common,
                type,
                url: message.media_url || message.content || '',
                thumbnailUrl: this.extraString(extra, 'thumbnail_url'),
                duration: this.extraNumber(extra, 'MESSAGE_EXTRA_KEY_DURATION', 'duration'),
                width: this.extraNumber(extra, 'MESSAGE_EXTRA_KEY_WIDTH', 'width'),
                height: this.extraNumber(extra, 'MESSAGE_EXTRA_KEY_HEIGHT', 'height'),
                thumbnailWidth: this.extraNumber(extra, 'MESSAGE_EXTRA_KEY_THUMB_WIDE', 'thumbnailWidth'),
                thumbnailHeight: this.extraNumber(extra, 'MESSAGE_EXTRA_KEY_THUMB_HEIGHT', 'thumbnailHeight'),
                size: this.extraNumber(extra, 'MESSAGE_EXTRA_KEY_SIZE', 'size'),
                format: this.extraString(extra, 'MESSAGE_EXTRA_KEY_FORMAT', 'format') ?? '',
                fileName: this.extraString(extra, 'MESSAGE_EXTRA_KEY_NAME') ?? '',
            };
        }

        if (type === MessageType.CHAT_FILE || type === MessageType.GROUP_FILE) {
            return {
                ...common,
                type,
                url: message.media_url || '',
                fileName: this.extraString(extra, 'MESSAGE_EXTRA_KEY_NAME', 'file_name', 'fileName')
                    ?? (message.content || ''),
                size: this.extraNumber(extra, 'MESSAGE_EXTRA_KEY_SIZE', 'size'),
                format: this.extraString(extra, 'MESSAGE_EXTRA_KEY_FORMAT', 'format') ?? '',
            };
        }

        return null;
    }

    /**
     * 解析会话的服务端 session_id（雪花 ID）。
     * 会话重构后消息按雪花 session_id 存储，history 等接口不再接受本地 session_key，
     * 优先取本地缓存，未命中时通过 GET /message/session 按 key 解析（服务端不存在则创建）。
     */
    private async resolveServerSessionId(sessionKey: string): Promise<string> {
        const sessionStore = useSessionStore();
        const cached = sessionStore.getSession(sessionKey)?.session_id;
        if (cached) return cached;

        try {
            const res = await getSession({
                session_key: sessionKey,
                session_type: toServerSessionType(judgeSessionType(sessionKey)),
            });
            const session = res.data?.session;
            if (res.code === 200 && session?.session_id) {
                const updated = sessionStore.upsertSession({
                    session_id: session.session_id,
                    session_key: sessionKey,
                    max_seq: seqMax(session.max_seq, session.actual_seq),
                });
                if (updated) {
                    void sessionService.saveMany([toRaw(updated) as ImTypes.Session]);
                }
                return session.session_id;
            }
        } catch (e) {
            console.error(`[ChatService] resolve session_id for ${sessionKey} failed:`, e);
        }
        return '';
    }

    /**
     * startSeq/endSeq 为 Lamport seq 字符串，'-1' 表示无界；非负表示闭区间边界。
     * 向旧消息拉取：startSeq='-1', endSeq=upper → DESC
     * 向新消息拉取：startSeq=lower, endSeq='-1' → ASC
     * 首次拉取：startSeq='-1', endSeq='-1' → DESC，取最新 limit 条
     */
    private async fetchHistoryFromApi(
        sessionKey: string,
        pageSize: number,
        range?: { startSeq?: string; endSeq?: string }
    ): Promise<IChatMessage[]> {
        const serverSessionId = await this.resolveServerSessionId(sessionKey);
        if (!serverSessionId) return [];

        const startSeq = range?.startSeq && seqPositive(range.startSeq) ? toSeq(range.startSeq) : '-1';
        const endSeq = range?.endSeq && seqPositive(range.endSeq) ? toSeq(range.endSeq) : '-1';

        const params: PartialExcept<ApiTypes.message.GetHistoryReq, 'session_id'> = {
            session_id: serverSessionId,
            limit: pageSize,
            start_seq: startSeq,
            end_seq: endSeq,
        };

        const resp = await getHistory(params);
        const list: ApiTypes.message.Message[] = Array.isArray(resp.data?.list) ? resp.data.list : [];
        let messages = list
            .map((item: ApiTypes.message.Message) => this.mapApiMessage(item))
            .filter((item: IChatMessage | null): item is IChatMessage => item !== null);

        const hasStart = startSeq !== '-1';
        const hasEnd = endSeq !== '-1';
        if (hasStart || hasEnd) {
            messages = messages.filter((item) => {
                if (!seqPositive(item.seq)) return true;
                if (hasStart && seqLt(item.seq, startSeq)) return false;
                if (hasEnd && seqGt(item.seq, endSeq)) return false;
                return true;
            });
        }

        messages.sort((a, b) => {
            if (seqPositive(a.seq) && seqPositive(b.seq)) {
                const cmp = seqCompare(a.seq, b.seq);
                if (cmp !== 0) return cmp;
            }

            const timeA = this.normalizeNumber(a.sendTime);
            const timeB = this.normalizeNumber(b.sendTime);
            if (timeA !== timeB) return timeA - timeB;

            const keyA = `${a.msgId || ''}-${a.clientId || ''}`;
            const keyB = `${b.msgId || ''}-${b.clientId || ''}`;
            return keyA.localeCompare(keyB);
        });

        if (messages.length > 0) {
            // 保存前确保每条消息携带 sessionKey，供 DB 层按 session_key 索引存储
            const toSave = messages.map(m => (m.sessionKey ? m : { ...m, sessionKey }));
            await messageService.saveMessages(toSave);
        }

        return messages;
    }

    /**
     * 增量拉取 afterSeq 之后的全部消息（用于重连/上线后的离线消息补齐）。
     * Lamport seq 不连续，无法由区间宽度推断数量，按 ASC 分页循环直到拉尽。
     * @param afterSeq 排他性下界（本地已有的最大 seq，'0' 表示从头拉取最近页）
     */
    async fetchMessagesSince(
        sessionKey: string,
        afterSeq: string,
        pageSize: number = 50,
        maxPages: number = 20,
        signal?: AbortSignal,
    ): Promise<IChatMessage[]> {
        if (!sessionKey) return [];
        // 本地无任何记录时不做全量回放，只取最新一页（更早历史由用户翻页按需拉取）
        if (!seqPositive(afterSeq)) {
            return this.fetchHistoryFromApi(sessionKey, pageSize);
        }

        const all: IChatMessage[] = [];
        let cursor = toSeq(afterSeq);
        for (let page = 0; page < maxPages; page++) {
            if (signal?.aborted) break;
            // startSeq 有界 + endSeq 无界 → 服务端按 seq ASC 返回
            const batch = await this.fetchHistoryFromApi(sessionKey, pageSize, {
                startSeq: seqPlusOne(cursor),
            });
            if (batch.length === 0) break;
            all.push(...batch);

            const lastSeq = batch.reduce((acc, m) => (seqGt(m.seq, acc) ? toSeq(m.seq) : acc), cursor);
            if (!seqGt(lastSeq, cursor)) break; // 防御：无进展则退出
            cursor = lastSeq;

            if (batch.length < pageSize) break;
        }
        return all;
    }

    /**
     * Get history messages for a session.
     * @param sessionKey The session key to fetch messages for.
     * @param beforeSeq 排他性上界（Lamport seq 字符串），拉取 seq < beforeSeq 的消息；undefined 表示首次加载，拉取最新一页。
     * @param pageSize Number of messages to fetch.
     */
    async getHistoryMessages(
        sessionKey: string,
        beforeSeq?: string,
        pageSize: number = 20,
    ): Promise<IChatMessage[]> {
        if (!sessionKey || pageSize <= 0) return [];

        // 本地查询：session_key 精确匹配，beforeSeq 直接传给 DB 层（排他上界：seq < beforeSeq）
        // 首次加载（beforeSeq === undefined）表示不限上界
        const local = await messageService.getLocalHistoryMessages(
            sessionKey,
            beforeSeq,
            pageSize
        );

        // 如果本地数据能填满一页，直接返回
        if (local.length === pageSize) {
            return local;
        }

        // 本地未命中或数量不足，从远端 API 拉取以填补空缺
        // beforeSeq 有值：endSeq = beforeSeq - 1（含）；无值（首次加载）：无界（后端取最新）
        // Lamport seq 仅作区间边界使用，-1n 不代表"上一条"
        const endSeq = beforeSeq && seqPositive(beforeSeq)
            ? (BigInt(toSeq(beforeSeq)) - 1n).toString()
            : undefined;
        const apiMessages = await this.fetchHistoryFromApi(sessionKey, pageSize, { endSeq });

        // 如果 API 返回了新数据，说明填补了空缺，重新从本地查一次（确保混合本地 unconfirmed 消息并正确排序）
        if (apiMessages.length > 0) {
            return await messageService.getLocalHistoryMessages(
                sessionKey,
                beforeSeq,
                pageSize
            );
        }

        // 如果 API 也没有更多数据，就返回仅有的 local 数据
        return local;
    }

    /**
     * 离线同步：
     * 1. 拉取活跃会话，对 server actual_seq > 本地 max_seq 的会话按 seq 区间增量补拉离线消息
     *    （离线期间服务端只存不推，上线后由客户端拉齐）
     * 2. 拉取用户会话列表，以服务端计算的 unread_count（基于已读游标点查）覆盖本地未读数
     */
    async syncOfflineActiveSessions() {
        if (this.offlineSyncInFlight) return;
        this.offlineSyncInFlight = true;
        const abort = new AbortController();
        this.offlineSyncAbort = abort;
        try {
            await this._doSyncOfflineActiveSessions(abort.signal);
        } finally {
            this.offlineSyncInFlight = false;
            if (this.offlineSyncAbort === abort) {
                this.offlineSyncAbort = null;
            }
        }
    }

    /** 中止在途的离线同步（登出、离开主界面时调用） */
    cancelOfflineSync() {
        this.offlineSyncAbort?.abort();
    }

    private async _doSyncOfflineActiveSessions(signal: AbortSignal) {
        const sessionStore = useSessionStore();
        const messageStore = useMessageStore();
        const timestamp = getOfflineTimestamp();

        // ── 1. 活跃会话 + 离线消息增量补拉 ─────────────────────────────
        const res = await getUserActiveSessions({ timestamp });
        if (res.code === 200 && res.data?.sessions) {
            const updatedSessions: ImTypes.Session[] = [];
            for (const ss of res.data.sessions) {
                if (signal.aborted) break;
                if (!ss.session_key) continue;
                const localMaxSeq = toSeq(sessionStore.getSession(ss.session_key)?.max_seq);
                // Lamport 语义下 max_seq 与 actual_seq 等价（服务端兼容返回）
                const serverMaxSeq = seqMax(ss.max_seq, ss.actual_seq);

                const updated = sessionStore.upsertSession({
                    session_id: ss.session_id,
                    session_key: ss.session_key,
                    // 服务端 type 为 model 值(1/2)，与前端枚举(0/1)不同，统一由 session_key 推导
                    type: judgeSessionType(ss.session_key),
                    max_seq: serverMaxSeq,
                    last_content: ss.last_content,
                    last_sender: ss.last_sender,
                    create_time: ss.create_time,
                    update_time: ss.update_time,
                });
                if (updated) updatedSessions.push(toRaw(updated) as ImTypes.Session);

                // 本地落后于服务端：按 (localMaxSeq, +∞) 分页拉齐离线消息
                if (seqGt(serverMaxSeq, localMaxSeq)) {
                    try {
                        const missing = await this.fetchMessagesSince(ss.session_key, localMaxSeq, 50, 20, signal);
                        if (missing.length > 0) {
                            if (sessionStore.currentSessionKey === ss.session_key) {
                                missing.forEach(m => messageStore.upsertMessage(m));
                            } else {
                                // 补拉的消息只写了库未进内存，该会话的消息缓存已过期
                                messageStore.invalidateMessageCache(ss.session_key);
                            }
                        }
                    } catch (e) {
                        console.error(`[ChatService] backfill offline messages for ${ss.session_key} failed:`, e);
                    }
                }
            }
            if (updatedSessions.length > 0) {
                void sessionService.saveMany(updatedSessions);
            }
        }

        // ── 2. 服务端未读数对齐（按 session_id 匹配本地会话）─────────────
        if (signal.aborted) return;
        try {
            const convRes = await getUserSessions();
            if (convRes.code === 200 && convRes.data?.sessions) {
                const toPersist: ImTypes.Session[] = [];
                for (const us of convRes.data.sessions) {
                    const local = sessionStore.sessionList.find(c => c.session_id === us.session_id);
                    if (!local) continue;
                    if (local.session_key === sessionStore.currentSessionKey) {
                        // 正在查看的会话：本地已读为准，反向推进服务端游标
                        void sessionStore.reportSessionRead(local.session_key);
                    } else {
                        local.unread_count = Number(us.unread_count) || 0;
                    }
                    if (us.is_top) local.is_top = us.is_top;
                    if (us.is_disturb) local.is_disturb = us.is_disturb;
                    toPersist.push(toRaw(local) as ImTypes.Session);
                }
                if (toPersist.length > 0) {
                    void sessionService.saveMany(toPersist);
                }
            }
        } catch (e) {
            console.error('[ChatService] sync server unread counts failed:', e);
        }
    }

    /**
     * 处理群操作通知（统一 NotifyMessage 信封的 group_notify 载荷）。
     * @param groupNotification 已从信封解出的群操作通知载荷
     * @param envelope 信封顶层基础字段（msg_id / session_id / seq，落库时回填）
     */
    async parseGroupNotification(
        groupNotification: ImTypes.GroupNotification,
        envelope?: { msgId?: string; sessionId?: string; seq?: string },
    ) {
        const msg = convertNotificationToChatMessage(groupNotification, envelope);

        let shouldIncrementUnread = false;
        let shouldPlaySound = false;

        switch (groupNotification.op_type) {
            case ImTypes.GroupOperationType.GROUP_OP_CREATE:
                if (groupNotification.group_info) {
                    await cacheService.updateItems(UpdateAction.Add, ResourceType.GROUP, [groupNotification.group_info as unknown as ImTypes.GroupInfo]);
                    await cacheService.updateItems(UpdateAction.Add, ResourceType.GROUP_JOINED, [groupNotification.group_info.id]);
                }
                shouldIncrementUnread = true;
                shouldPlaySound = true;
                break;
            case ImTypes.GroupOperationType.GROUP_OP_DISMISS:
                break;
            case ImTypes.GroupOperationType.GROUP_OP_JOIN: {
                const group = await groupService.fetchByIds([groupNotification.group_id]);
                if (group.length > 0) {
                    group[0].member_count++;
                    await cacheService.updateItems(UpdateAction.Update, ResourceType.GROUP, [group[0]]);
                }
                break;
            }
            case ImTypes.GroupOperationType.GROUP_OP_LEAVE:
                break;
            case ImTypes.GroupOperationType.GROUP_OP_KICK:
                break;
            case ImTypes.GroupOperationType.GROUP_OP_INVITE:
                break;
            case ImTypes.GroupOperationType.GROUP_OP_UPDATE_INFO:
                break;
            case ImTypes.GroupOperationType.GROUP_OP_MUTE:
                break;
            case ImTypes.GroupOperationType.GROUP_OP_UNMUTE:
                break;
            case ImTypes.GroupOperationType.UNRECOGNIZED:
                break;
        }

        return {
            msg,
            sessionKey: msg.sessionKey,
            shouldIncrementUnread,
            shouldPlaySound,
        };
    }

}

export const chatService = new ChatService();
