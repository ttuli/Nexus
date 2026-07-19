import { toRaw } from 'vue';
import { getHistory, getSession, getUserActiveSessions, getUserSessions } from '@/src/apis/message';
import { ApiTypes, ImTypes, PartialExcept, ResourceType, UpdateAction } from '@shared/types';
import { MessageStatus, MessageType } from '@shared/types/proto';
import { IChatMessage, ILocalSystemMessage } from '@shared/types/chatMessage';
import { toSeq, seqPositive, seqLt, seqGt, seqCompare, seqPlusOne, seqMax } from '@shared/utils/seq';

import { convertNotificationToChatMessage } from '@/src/utils/messageConverter';
import { judgeSessionType, toServerSessionType } from '@/src/utils/sessionUtils';
import { useSessionStore } from '@/src/store/session';
import { useMessageStore } from '@/src/store/message';
import { useUserStore } from '@/src/store/user';
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

    private mapApiMessage(
        message: ApiTypes.message.Message,
        notifyCollector?: ImTypes.GroupNotification[],
    ): IChatMessage | null {
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

        if (type === MessageType.GROUP_OP_NOTIFICATION) {
            return this.mapApiNotifyMessage(message, extra, common, notifyCollector);
        }

        return null;
    }

    /** hex 字符串 → 字节数组（服务端 extra 中的 protobuf 载荷以 hex 编码存储） */
    private hexToBytes(hex: string): Uint8Array {
        const clean = hex.length % 2 === 0 ? hex : '0' + hex;
        const out = new Uint8Array(clean.length / 2);
        for (let i = 0; i < out.length; i++) {
            out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
        }
        return out;
    }

    /**
     * 历史接口中的通知类消息（GROUP_OP_NOTIFICATION）：服务端将原始 NotifyMessage
     * 以 hex 编码存放在 extra.MESSAGE_EXTRA_KEY_NOTIFY_PAYLOAD，解码后复用 WS 路径
     * 的转换器生成本地系统消息，保证离线拉取的群操作事件与在线推送展示一致。
     * 载荷缺失或解码失败时，退化为仅展示服务端预生成 content 文本的系统消息。
     * @param notifyCollector 传入时收集解码出的群操作通知（供离线补拉后统一应用缓存副作用）
     */
    private mapApiNotifyMessage(
        message: ApiTypes.message.Message,
        extra: Record<string, unknown>,
        common: Omit<ILocalSystemMessage, 'type'>,
        notifyCollector?: ImTypes.GroupNotification[],
    ): IChatMessage | null {
        const payloadHex = this.extraString(extra, 'MESSAGE_EXTRA_KEY_NOTIFY_PAYLOAD', 'notify_payload');
        if (payloadHex) {
            try {
                const notify = ImTypes.NotifyMessage.decode(this.hexToBytes(payloadHex));
                if (notify.group_notify) {
                    notifyCollector?.push(notify.group_notify);
                    return convertNotificationToChatMessage(notify.group_notify, {
                        msgId: message.msg_id,
                        sessionId: message.session_id,
                        seq: toSeq(message.seq),
                    });
                }
                // recall 等其他控制类 body 不作为消息行展示（撤回由原消息 status 承载）
                return null;
            } catch (e) {
                console.error('[ChatService] decode notify payload failed:', e);
            }
        }

        if (!message.content) return null;
        const fallback: ILocalSystemMessage = {
            ...common,
            type: MessageType.GROUP_OP_NOTIFICATION,
            content: message.content,
        };
        return fallback;
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
        range?: { startSeq?: string; endSeq?: string },
        notifyCollector?: ImTypes.GroupNotification[],
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
            .map((item: ApiTypes.message.Message) => this.mapApiMessage(item, notifyCollector))
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
        // 本地无任何记录时不做全量回放，只取最新一页（更早历史由用户翻页按需拉取）。
        // 此路径不应用群操作副作用：无法判定页内事件是否早已处理过（如清库重装），
        // 重放旧的踢人/退群事件会破坏成员缓存；成员一致性由 TTL 过期回源兜底。
        if (!seqPositive(afterSeq)) {
            return this.fetchHistoryFromApi(sessionKey, pageSize);
        }

        // 严格增量补拉（seq > 本地最大值）拉到的事件必然未处理过，
        // 收集群操作通知，拉齐后按序统一应用缓存副作用（与 WS 在线路径同一套逻辑）
        const groupNotifications: ImTypes.GroupNotification[] = [];
        const all: IChatMessage[] = [];
        let cursor = toSeq(afterSeq);
        for (let page = 0; page < maxPages; page++) {
            if (signal?.aborted) break;
            // startSeq 有界 + endSeq 无界 → 服务端按 seq ASC 返回
            const batch = await this.fetchHistoryFromApi(sessionKey, pageSize, {
                startSeq: seqPlusOne(cursor),
            }, groupNotifications);
            if (batch.length === 0) break;
            all.push(...batch);

            const lastSeq = batch.reduce((acc, m) => (seqGt(m.seq, acc) ? toSeq(m.seq) : acc), cursor);
            if (!seqGt(lastSeq, cursor)) break; // 防御：无进展则退出
            cursor = lastSeq;

            if (batch.length < pageSize) break;
        }

        if (groupNotifications.length > 0 && !signal?.aborted) {
            await this.applyGroupNotificationEffects(groupNotifications);
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

        await this.applyGroupNotificationEffects([groupNotification]);

        const isCreate = groupNotification.op_type === ImTypes.GroupOperationType.GROUP_OP_CREATE;
        return {
            msg,
            sessionKey: msg.sessionKey,
            shouldIncrementUnread: isCreate,
            shouldPlaySound: isCreate,
        };
    }

    /**
     * 将群操作通知的副作用应用到本地缓存（群信息 / 已加入群列表 / 群成员缓存）。
     * WS 实时路径单条应用；离线补拉路径批量应用（严格递增，事件均未处理过）。
     *
     * 成员缓存策略：通知只携带 target_ids 不携带完整成员数据，因此
     * 新增成员（JOIN/INVITE）与禁言状态变更走"有缓存才回源全量刷新"（主进程判定），
     * 移除成员（LEAVE/KICK）直接按 user_id 删除缓存行；均为幂等操作。
     * 批量应用时刷新按群去重且晚于删除执行，刷新取服务端当前真值，最终状态收敛。
     */
    private async applyGroupNotificationEffects(notifications: ImTypes.GroupNotification[]): Promise<void> {
        const meId = useUserStore().getUserID();
        const groupsToSync = new Set<number>();

        for (const n of notifications) {
            const groupId = n.group_id;
            if (!groupId) continue;
            const targets = n.target_ids || [];

            try {
                switch (n.op_type) {
                    case ImTypes.GroupOperationType.GROUP_OP_CREATE:
                        if (n.group_info) {
                            await cacheService.updateItems(UpdateAction.Add, ResourceType.GROUP, [n.group_info as unknown as ImTypes.GroupInfo]);
                            await cacheService.updateItems(UpdateAction.Add, ResourceType.GROUP_JOINED, [groupId]);
                        }
                        break;

                    // operator 即入群者；通知不带成员数据，刷新已有的成员缓存
                    case ImTypes.GroupOperationType.GROUP_OP_JOIN:
                        await this.adjustGroupMemberCount(groupId, 1, n.group_info);
                        groupsToSync.add(groupId);
                        break;

                    // GROUP_OP_INVITE 不在此处理：邀请为待确认制，经 UserNotifier 定向
                    // 投递给被邀请者、由 wsNotificationListener 刷新邀请收件箱，不落群会话；
                    // 被邀请者接受后才发 GROUP_OP_JOIN 走上面的入群逻辑。
                    case ImTypes.GroupOperationType.GROUP_OP_INVITE:
                        break;

                    // operator 即退群者
                    case ImTypes.GroupOperationType.GROUP_OP_LEAVE:
                        if (meId && n.operator_id === meId) {
                            // 本账号在其他设备退群：本地成员视图整体失效
                            await this.dropGroupMembership(groupId);
                        } else if (n.operator_id) {
                            await groupService.removeCachedMembers(groupId, [n.operator_id]);
                            await this.adjustGroupMemberCount(groupId, -1, n.group_info);
                        }
                        break;

                    case ImTypes.GroupOperationType.GROUP_OP_KICK:
                        if (meId && targets.includes(meId)) {
                            // 自己被移出群
                            await this.dropGroupMembership(groupId);
                        } else if (targets.length > 0) {
                            await groupService.removeCachedMembers(groupId, targets);
                            await this.adjustGroupMemberCount(groupId, -targets.length, n.group_info);
                        }
                        break;

                    case ImTypes.GroupOperationType.GROUP_OP_DISMISS:
                        // 群已解散：保留 GROUP 信息缓存供历史消息渲染群名，仅清成员与加入关系
                        await this.dropGroupMembership(groupId);
                        break;

                    case ImTypes.GroupOperationType.GROUP_OP_UPDATE_INFO:
                    case ImTypes.GroupOperationType.GROUP_OP_INFO_UPDATE_NAME:
                    case ImTypes.GroupOperationType.GROUP_OP_INFO_UPDATE_NOTICE:
                        if (n.group_info) {
                            await cacheService.updateItems(UpdateAction.Update, ResourceType.GROUP, [n.group_info as unknown as ImTypes.GroupInfo]);
                        }
                        break;

                    // 禁言截止时间（mute_until）通知不携带，刷新已有的成员缓存
                    case ImTypes.GroupOperationType.GROUP_OP_MUTE:
                    case ImTypes.GroupOperationType.GROUP_OP_UNMUTE:
                        groupsToSync.add(groupId);
                        break;
                }
            } catch (e) {
                console.error('[ChatService] apply group notification effects failed:', n.op_type, groupId, e);
            }
        }

        if (groupsToSync.size > 0) {
            await Promise.all(
                [...groupsToSync].map(groupId =>
                    groupService.syncGroupMembers(groupId).catch(e =>
                        console.error('[ChatService] sync group members failed:', groupId, e))
                )
            );
        }
    }

    /**
     * 自己不再是群成员（退群/被踢/群解散）时的缓存清理：
     * 成员缓存整群删除 + 从已加入群列表移除
     */
    private async dropGroupMembership(groupId: number): Promise<void> {
        await groupService.clearCachedMembers(groupId);
        await cacheService.updateItems(UpdateAction.Delete, ResourceType.GROUP_JOINED, [groupId]);
    }

    /**
     * 调整群信息缓存中的成员数。通知携带权威 group_info 时直接覆盖；
     * 否则基于缓存值本地增减（缓存 miss 回源 API 时服务端计数已含本次变更，可能有轻微偏差，
     * 以 group_info 或下次全量拉取为准）
     */
    private async adjustGroupMemberCount(groupId: number, delta: number, groupInfo?: unknown): Promise<void> {
        if (groupInfo) {
            await cacheService.updateItems(UpdateAction.Update, ResourceType.GROUP, [groupInfo as ImTypes.GroupInfo]);
            return;
        }
        if (delta === 0) return;
        const groups = await groupService.fetchByIds([groupId]);
        if (groups.length > 0) {
            const updated = { ...groups[0], member_count: Math.max(0, (groups[0].member_count || 0) + delta) };
            await cacheService.updateItems(UpdateAction.Update, ResourceType.GROUP, [updated]);
        }
    }

}

export const chatService = new ChatService();
