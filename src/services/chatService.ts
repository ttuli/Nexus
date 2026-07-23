import { toRaw } from 'vue';
import { getHistory, getSession, getUserActiveSessions, getUserSessions, markSessionRead, recallMessage as recallMessageApi, updateSession as updateSessionApi } from '@/src/apis/message';
import { ApiTypes, ImTypes, PartialExcept, ResourceType, UpdateAction } from '@shared/types';
import { MessageStatus, MessageType } from '@shared/types/proto';
import { IChatMessage, ILocalSystemMessage } from '@shared/types/chatMessage';
import { toSeq, seqPositive, seqLt, seqGt, seqCompare, seqPlusOne, seqMax } from '@shared/utils/seq';

import { convertNotificationToChatMessage } from '@/src/utils/messageConverter';
import { judgeSessionType, toServerSessionType } from '@/src/utils/sessionUtils';
import { useSessionStore } from '@/src/store/session';
import type { HistoryPage } from '@/src/store/message';
import cacheService from './cacheService';
import groupService from './groupService';
import { messageService } from './messageService';
import { sessionService } from './sessionService';

/** 从历史/补拉数据中解出的撤回事件（msgId 指被撤回的原消息） */
export interface RecallEvent {
    msgId: string;
    sessionId: string;
    recallTime: number;
}

class ChatService {
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
        recallCollector?: RecallEvent[],
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
            return this.mapApiNotifyMessage(message, extra, common, notifyCollector, recallCollector);
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
     * @param recallCollector 传入时收集撤回事件（增量补拉不会重拉旧的原消息，
     *   需由收集方将撤回状态落到本地已存的原消息上）
     */
    private mapApiNotifyMessage(
        message: ApiTypes.message.Message,
        extra: Record<string, unknown>,
        common: Omit<ILocalSystemMessage, 'type'>,
        notifyCollector?: ImTypes.GroupNotification[],
        recallCollector?: RecallEvent[],
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
                // recall 等控制类 body 不作为消息行展示（撤回状态由原消息承载），
                // 但需收集供拉取方对齐本地原消息的撤回状态
                if (notify.recall?.msg_id) {
                    recallCollector?.push({
                        msgId: notify.recall.msg_id,
                        sessionId: message.session_id || '',
                        recallTime: Number(notify.recall.recall_time) || 0,
                    });
                }
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
        recallCollector?: RecallEvent[],
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
            .map((item: ApiTypes.message.Message) => this.mapApiMessage(item, notifyCollector, recallCollector))
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
     * @param meId 当前登录用户 id（应用群操作副作用时判断退群/被踢是否针对自己）
     * @returns messages 为补拉到的可展示消息；recalls 为区间内的撤回事件——
     *   SQLite 侧状态已由本方法落库，内存（store）侧对齐由调用方负责
     */
    async fetchMessagesSince(
        sessionKey: string,
        afterSeq: string,
        meId: number,
        pageSize: number = 50,
        maxPages: number = 20,
        signal?: AbortSignal,
    ): Promise<{ messages: IChatMessage[]; recalls: RecallEvent[] }> {
        if (!sessionKey) return { messages: [], recalls: [] };
        // 本地无任何记录时不做全量回放，只取最新一页（更早历史由用户翻页按需拉取）。
        // 此路径不应用群操作/撤回副作用：无法判定页内事件是否早已处理过（如清库重装），
        // 且页内被撤回的原消息本就携带服务端已更新的 RECALLED 状态，落库即正确。
        if (!seqPositive(afterSeq)) {
            return { messages: await this.fetchHistoryFromApi(sessionKey, pageSize), recalls: [] };
        }

        // 严格增量补拉（seq > 本地最大值）拉到的事件必然未处理过，
        // 收集群操作通知，拉齐后按序统一应用缓存副作用（与 WS 在线路径同一套逻辑）
        const groupNotifications: ImTypes.GroupNotification[] = [];
        const recalls: RecallEvent[] = [];
        const all: IChatMessage[] = [];
        let cursor = toSeq(afterSeq);
        for (let page = 0; page < maxPages; page++) {
            if (signal?.aborted) break;
            // startSeq 有界 + endSeq 无界 → 服务端按 seq ASC 返回
            const batch = await this.fetchHistoryFromApi(sessionKey, pageSize, {
                startSeq: seqPlusOne(cursor),
            }, groupNotifications, recalls);
            if (batch.length === 0) break;
            all.push(...batch);

            const lastSeq = batch.reduce((acc, m) => (seqGt(m.seq, acc) ? toSeq(m.seq) : acc), cursor);
            if (!seqGt(lastSeq, cursor)) break; // 防御：无进展则退出
            cursor = lastSeq;

            if (batch.length < pageSize) break;
        }

        if (groupNotifications.length > 0 && !signal?.aborted) {
            await this.applyGroupNotificationEffects(groupNotifications, meId);
        }

        // 撤回对齐：后端撤回 = 原消息状态改 RECALLED + 插入通知行；增量补拉只拉新 seq，
        // 不会重拉旧的原消息，故按收集到的撤回事件把状态直接落到本地 SQLite（幂等）
        if (recalls.length > 0 && !signal?.aborted) {
            for (const r of recalls) {
                await messageService.updateMessageStatus(
                    sessionKey, '', MessageStatus.MESSAGE_STATUS_RECALLED, r.msgId,
                );
            }
        }
        return { messages: all, recalls };
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
        sessionMaxSeq?: string,
    ): Promise<HistoryPage> {
        if (!sessionKey || pageSize <= 0) return { messages: [] };

        // 本地查询：session_key 精确匹配，beforeSeq 直接传给 DB 层（排他上界：seq < beforeSeq）
        // 首次加载（beforeSeq === undefined）表示不限上界；DB 层按 seq 升序返回（末条为最新）
        const local = await messageService.getLocalHistoryMessages(sessionKey, beforeSeq, pageSize);

        // 本地边界判断：不再以"是否满一页"决定阻塞拉取（小会话/末页会误触发 API 拖慢响应），
        // 而是看本地这一页是否已抵达应有边界——首屏时本地最新一条是否已对齐会话 max_seq
        // （max_seq 由调用方 store 传入，本服务不反向依赖 store）。
        const isFirstPage = beforeSeq === undefined;
        const newestLocalSeq = local.length > 0 ? local[local.length - 1].seq : undefined;
        // 首屏本地已含最新消息（末条 seq ≥ 会话 max_seq）
        const localHasNewest = isFirstPage && newestLocalSeq !== undefined && seqPositive(sessionMaxSeq)
            && !seqLt(newestLocalSeq, sessionMaxSeq);
        // 首屏本地落后于服务端最新（顶部有缺口，需补新消息）
        const topGap = isFirstPage && seqPositive(sessionMaxSeq)
            && (newestLocalSeq === undefined || seqLt(newestLocalSeq, sessionMaxSeq));

        // 本地够用：拿到整页（更早的留给下次翻页/后台补），或首屏已含最新消息
        const localSufficient = local.length >= pageSize || (local.length > 0 && localHasNewest);
        if (localSufficient) {
            // 本窗口未证实完整（不满页 → 可能缺更早的；或首屏落后最新 → 顶部缺口）时，
            // 发起后台补齐 I/O 并把承诺随页返回；合并进 store 由调用方（message store）负责
            const windowComplete = local.length >= pageSize && !topGap;
            return windowComplete
                ? { messages: local }
                : { messages: local, reconcile: this.reconcileHistory(sessionKey, beforeSeq, pageSize) };
        }

        // 本地为空 / 不足且未对齐边界：同步补一页兜底（否则首屏空白或漏消息）
        // beforeSeq 有值：endSeq = beforeSeq - 1（含）；无值（首次加载）：无界（后端取最新）
        const endSeq = beforeSeq && seqPositive(beforeSeq)
            ? (BigInt(toSeq(beforeSeq)) - 1n).toString()
            : undefined;
        const apiMessages = await this.fetchHistoryFromApi(sessionKey, pageSize, { endSeq });
        if (apiMessages.length > 0) {
            // 重新从本地查一次（混合本地 unconfirmed 消息并正确排序）
            return { messages: await messageService.getLocalHistoryMessages(sessionKey, beforeSeq, pageSize) };
        }
        return { messages: local };
    }

    /**
     * 后台补齐历史缺口（纯 I/O）：拉取远端同一窗口 → 落库（fetchHistoryFromApi 内已写 SQLite）→
     * 返回补齐后的本地页。不触碰 store：并入由调用方（message store）负责。
     * best-effort，失败仅记日志，返回空数组。
     */
    private async reconcileHistory(
        sessionKey: string,
        beforeSeq: string | undefined,
        pageSize: number,
    ): Promise<IChatMessage[]> {
        try {
            const endSeq = beforeSeq && seqPositive(beforeSeq)
                ? (BigInt(toSeq(beforeSeq)) - 1n).toString()
                : undefined;
            const apiMessages = await this.fetchHistoryFromApi(sessionKey, pageSize, { endSeq });
            if (apiMessages.length === 0) return [];
            return await messageService.getLocalHistoryMessages(sessionKey, beforeSeq, pageSize);
        } catch (e) {
            console.error(`[ChatService] reconcile history for ${sessionKey} failed:`, e);
            return [];
        }
    }

    /**
     * 撤回消息 I/O（仅发送者本人、2 分钟内，服务端校验）：仅调用服务端接口并返回结果。
     * 本地乐观更新/落库由 composable 编排；服务端随后广播的 MSG_OP_RECALL 通知会幂等对齐
     * （也覆盖其他成员/多端）。失败文案由请求拦截器统一 toast。
     */
    async recallMessage(msgId: string, sessionId: string): Promise<boolean> {
        if (!msgId) return false;
        try {
            const res = await recallMessageApi({ msg_id: msgId, session_id: sessionId });
            return res.code === 200;
        } catch (e) {
            console.error('[ChatService] recallMessage failed:', e);
            return false;
        }
    }

    /**
     * 上报会话已读游标（纯 I/O）。Lamport seq 不连续，服务端未读数依赖该游标做点查计数；
     * 游标单调前进，重复/乱序上报无害。守卫（session_id 非空 / max_seq 为正）由调用方负责。
     */
    async reportRead(sessionId: string, readSeq: string): Promise<void> {
        try {
            await markSessionRead({ session_id: sessionId, read_seq: readSeq });
        } catch (e) {
            console.error('[ChatService] reportRead failed:', e);
        }
    }

    /**
     * 更新会话设置（置顶/免打扰）到服务端（纯 I/O）。
     * 服务端优先按 session_id 定位，id 为空时按 session_key 解析/创建。
     * 失败文案由请求拦截器统一 toast，此处仅记日志。
     */
    async updateSessionOptions(sessionId: string, sessionKey: string, isTop: number, isDisturb: number): Promise<void> {
        try {
            await updateSessionApi({
                session_id: sessionId,
                session_key: sessionKey,
                is_top: isTop,
                is_disturb: isDisturb,
            });
        } catch (e) {
            console.error('[ChatService] updateSessionOptions failed:', e);
        }
    }

    /**
     * 拉取 timestamp 之后有动态的活跃会话列表（纯 I/O）。
     * 网络错误向上抛出，由调用方（离线同步编排 composables/offlineSync）处置。
     */
    async fetchActiveSessions(timestamp: number): Promise<ApiTypes.message.Session[]> {
        const res = await getUserActiveSessions({ timestamp });
        return res.code === 200 && Array.isArray(res.data?.sessions) ? res.data.sessions : [];
    }

    /** 拉取用户会话列表（含服务端计算的未读数/置顶/免打扰，纯 I/O），网络错误向上抛出 */
    async fetchUserSessions(): Promise<ApiTypes.message.UserSession[]> {
        const res = await getUserSessions();
        return res.code === 200 && Array.isArray(res.data?.sessions) ? res.data.sessions : [];
    }

    /**
     * 处理群操作通知（统一 NotifyMessage 信封的 group_notify 载荷）。
     * @param groupNotification 已从信封解出的群操作通知载荷
     * @param meId 当前登录用户 id（判断退群/被踢是否针对自己）
     * @param envelope 信封顶层基础字段（msg_id / session_id / seq，落库时回填）
     */
    async parseGroupNotification(
        groupNotification: ImTypes.GroupNotification,
        meId: number,
        envelope?: { msgId?: string; sessionId?: string; seq?: string },
    ) {
        const msg = convertNotificationToChatMessage(groupNotification, envelope);

        await this.applyGroupNotificationEffects([groupNotification], meId);

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
    private async applyGroupNotificationEffects(notifications: ImTypes.GroupNotification[], meId: number): Promise<void> {
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
