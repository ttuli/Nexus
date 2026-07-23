/**
 * 离线同步编排（模块级纯函数，非 hook，模式同 sessionActions）：
 * 1. 拉取活跃会话，对 server seq > 本地 max_seq 的会话按 seq 区间增量补拉离线消息
 *    （离线期间服务端只存不推，上线/重连后由客户端拉齐）
 * 2. 拉取用户会话列表，以服务端计算的 unread_count（基于已读游标点查）覆盖本地未读数
 * 原为 chatService 内部流程，因需驱动 sessionStore/messageStore，按分层上移至编排层。
 */
import { toRaw } from 'vue';
import { ImTypes } from '@shared/types';
import { toSeq, seqGt, seqMax } from '@shared/utils/seq';
import { judgeSessionType } from '@/src/utils/sessionUtils';
import { useSessionStore } from '@/src/store/session';
import { useMessageStore } from '@/src/store/message';
import { useUserStore } from '@/src/store/user';
import { getOfflineTimestamp } from '@/src/store/init';
import { chatService } from '@/src/services/chatService';
import { sessionService } from '@/src/services/sessionService';
import { reportSessionRead } from './sessionActions';

// 离线同步在途标记：防止挂载同步与重连同步并发重入
let syncInFlight = false;
// 离线同步取消令牌：登出/离开主界面时中止分页拉取序列
let syncAbort: AbortController | null = null;

export async function syncOfflineActiveSessions(): Promise<void> {
    if (syncInFlight) return;
    syncInFlight = true;
    const abort = new AbortController();
    syncAbort = abort;
    try {
        await doSync(abort.signal);
    } finally {
        syncInFlight = false;
        if (syncAbort === abort) {
            syncAbort = null;
        }
    }
}

/** 中止在途的离线同步（登出、离开主界面时调用） */
export function cancelOfflineSync(): void {
    syncAbort?.abort();
}

async function doSync(signal: AbortSignal): Promise<void> {
    const sessionStore = useSessionStore();
    const messageStore = useMessageStore();
    const meId = useUserStore().getUserID();
    const timestamp = getOfflineTimestamp();

    // ── 1. 活跃会话 + 离线消息增量补拉 ─────────────────────────────
    const activeSessions = await chatService.fetchActiveSessions(timestamp);
    const updatedSessions: ImTypes.Session[] = [];
    for (const ss of activeSessions) {
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
                const { messages: missing, recalls } = await chatService.fetchMessagesSince(ss.session_key, localMaxSeq, meId, 50, 20, signal);
                if (missing.length > 0) {
                    if (sessionStore.currentSessionKey === ss.session_key) {
                        missing.forEach(m => messageStore.upsertMessage(m));
                    } else {
                        // 补拉的消息只写了库未进内存，该会话的消息缓存已过期
                        messageStore.invalidateMessageCache(ss.session_key);
                    }
                }
                // 离线撤回对齐：SQLite 已在 service 侧落库；原消息仍在内存
                // （当前列表或 LRU 缓存，updateMessageStatus 两处都搜）时就地更新，
                // 不在内存则无需处理，下次打开会话时从库中读到的即是已撤回状态
                recalls.forEach(r => messageStore.updateMessageStatus(
                    r.sessionId, '', ImTypes.MessageStatus.MESSAGE_STATUS_RECALLED, r.recallTime, r.msgId,
                ));
            } catch (e) {
                console.error(`[OfflineSync] backfill offline messages for ${ss.session_key} failed:`, e);
            }
        }
    }
    if (updatedSessions.length > 0) {
        void sessionService.saveMany(updatedSessions);
    }

    // ── 2. 服务端未读数对齐（按 session_id 匹配本地会话）─────────────
    if (signal.aborted) return;
    try {
        const userSessions = await chatService.fetchUserSessions();
        const toPersist: ImTypes.Session[] = [];
        for (const us of userSessions) {
            const local = sessionStore.sessionList.find(c => c.session_id === us.session_id);
            if (!local) continue;
            const isCurrent = local.session_key === sessionStore.currentSessionKey;
            if (isCurrent) {
                // 正在查看的会话：本地已读为准，反向推进服务端游标
                reportSessionRead(local.session_key);
            }
            const updated = sessionStore.syncServerSessionMeta(us.session_id, {
                // 正在查看的会话不覆盖未读（保持本地已清零状态）
                unread_count: isCurrent ? undefined : (Number(us.unread_count) || 0),
                is_top: us.is_top,
                is_disturb: us.is_disturb,
            });
            if (updated) toPersist.push(toRaw(updated) as ImTypes.Session);
        }
        if (toPersist.length > 0) {
            void sessionService.saveMany(toPersist);
        }
    } catch (e) {
        console.error('[OfflineSync] sync server unread counts failed:', e);
    }
}
