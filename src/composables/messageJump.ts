/**
 * 主窗口的消息定位（历史消息窗口双击跳转）与「跳转窗口」的翻页编排。
 *
 * 目标已在当前列表里：直接请求视图滚过去并闪烁。还没加载：以目标 seq 为锚点，往前（含目标）、往后各取一页，
 * 整体替换成跳转窗口（messageStore.hasNewer）。跳转窗口里往上翻沿用 loadMore，往下翻用 loadNewerMessages；
 * 翻到最新或点「回到最新」（returnToLatest）后恢复普通列表。期间新消息只落库不追加（见 messageStore.upsertMessage）。
 *
 * 模块级函数（非 useXxx）：listener 与页面都直接调用。
 */
import { watch } from 'vue';
import { ElMessage } from 'element-plus';
import type { IChatMessage } from '@shared/types/chatMessage';
import type { MessageJumpTarget } from '@shared/types/window';
import { seqCompare, seqPlusOne, seqPositive, toSeq } from '@shared/utils/seq';
import { chatService } from '@/src/services/chatService';
import { newestConfirmedSeq, useMessageStore } from '@/src/store/message';
import { useSessionStore } from '@/src/store/session';

/** 等进行中的加载结束的上限 */
const IDLE_WAIT_MS = 5000;

/**
 * 每次整体替换列表（定位、回到最新）自增：连续双击不同消息时只执行最后一次，
 * 进行中的往下翻结果也随之作废
 */
let listGeneration = 0;

type NavigateToChat = (sessionKey: string, options?: { toggle?: boolean }) => void;

/** 等进行中的加载（进会话首屏、翻页）结束：晚到的结果会插进刚替换好的列表里 */
function waitUntilIdle(): Promise<void> {
    const messageStore = useMessageStore();
    if (!messageStore.isLoading) return Promise.resolve();
    return new Promise(resolve => {
        const timer = setTimeout(done, IDLE_WAIT_MS);
        const stop = watch(() => messageStore.isLoading, loading => { if (!loading) done(); });
        function done() {
            clearTimeout(timer);
            stop();
            resolve();
        }
    });
}

const messageKey = (m: IChatMessage) => m.msgId || m.clientId || '';

/** 按 seq 升序、按消息 ID 去重（两页查询口径不同，前一页按发送时间排序） */
function mergePages(...pages: IChatMessage[][]): IChatMessage[] {
    const seen = new Set<string>();
    return pages.flat()
        .filter(m => {
            const key = messageKey(m);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .sort((a, b) => seqCompare(a.seq, b.seq) || (a.sendTime || 0) - (b.sendTime || 0));
}

/**
 * 定位到某条消息：切到它所在的会话；已加载就直接滚过去，没加载就以它为锚点加载跳转窗口
 * @param navigateToChat 切会话（useChatNavigation 提供；它要在组件 setup 里取 router，由调用方传入）
 */
export async function jumpToMessage(target: MessageJumpTarget, navigateToChat: NavigateToChat): Promise<void> {
    const { sessionKey, msgId, seq } = target;
    if (!sessionKey || !msgId) return;
    const gen = ++listGeneration;
    const sessionStore = useSessionStore();
    const messageStore = useMessageStore();

    // 切到目标会话（已是当前会话时只确保停在聊天页）；切会话会触发首屏加载，等它结束再看目标在不在
    navigateToChat(sessionKey, { toggle: false });
    await waitUntilIdle();
    if (gen !== listGeneration || sessionStore.currentSessionKey !== sessionKey) return;

    if (messageStore.messages.some(m => m.msgId === msgId)) {
        messageStore.requestJump(msgId);
        return;
    }
    if (!seqPositive(seq)) return;

    messageStore.setLoading(true);
    try {
        const pageSize = messageStore.pageSize;
        const maxSeq = sessionStore.getSession(sessionKey)?.max_seq;
        const [older, newer] = await Promise.all([
            // 排他上界取 seq + 1：这一页以目标为末条
            chatService.getHistoryMessages(sessionKey, seqPlusOne(seq), pageSize, maxSeq),
            chatService.getNewerMessages(sessionKey, toSeq(seq), pageSize, maxSeq),
        ]);
        if (gen !== listGeneration || sessionStore.currentSessionKey !== sessionKey) return;

        const window = mergePages(older.messages, newer);
        if (!window.some(m => m.msgId === msgId)) {
            ElMessage.info('这条消息已不在本地记录中');
            return;
        }
        messageStore.enterJumpWindow(window, newer.length >= pageSize);
        if (older.reconcile) {
            void older.reconcile.then(fresh => messageStore.mergeHistoryMessages(sessionKey, fresh));
        }
        messageStore.requestJump(msgId);
    } catch (e) {
        console.error('[messageJump] jump failed:', e);
    } finally {
        // 不看 gen：下一次定位要等这把锁释放才开始
        if (sessionStore.currentSessionKey === sessionKey) messageStore.setLoading(false);
    }
}

/** 跳转窗口往更新的方向翻一页；这一页不满说明已到最新，退出跳转窗口 */
export async function loadNewerMessages(): Promise<void> {
    const sessionStore = useSessionStore();
    const messageStore = useMessageStore();
    const sessionKey = sessionStore.currentSessionKey;
    if (!sessionKey || messageStore.isLoading || !messageStore.hasNewer) return;
    const newest = newestConfirmedSeq(messageStore.messages);
    if (!newest) return;

    const gen = listGeneration;
    messageStore.setLoading(true);
    try {
        const pageSize = messageStore.pageSize;
        const maxSeq = sessionStore.getSession(sessionKey)?.max_seq;
        const page = await chatService.getNewerMessages(sessionKey, newest, pageSize, maxSeq);
        // 期间切了会话、重新定位或回到了最新：结果作废
        if (gen !== listGeneration || sessionStore.currentSessionKey !== sessionKey || !messageStore.hasNewer) return;
        messageStore.appendNewer(page, page.length >= pageSize);
    } catch (e) {
        console.error('[messageJump] load newer failed:', e);
    } finally {
        if (sessionStore.currentSessionKey === sessionKey) messageStore.setLoading(false);
    }
}

/** 回到最新：加载最新一页整体替换（不先清空，免得闪一下空白），退出跳转窗口 */
export async function returnToLatest(): Promise<void> {
    const sessionStore = useSessionStore();
    const messageStore = useMessageStore();
    const sessionKey = sessionStore.currentSessionKey;
    if (!sessionKey) return;
    const gen = ++listGeneration;

    await waitUntilIdle();
    if (gen !== listGeneration || sessionStore.currentSessionKey !== sessionKey) return;

    messageStore.setLoading(true);
    try {
        const maxSeq = sessionStore.getSession(sessionKey)?.max_seq;
        const page = await chatService.getHistoryMessages(sessionKey, undefined, messageStore.pageSize, maxSeq);
        if (gen !== listGeneration || sessionStore.currentSessionKey !== sessionKey) return;
        messageStore.enterLatestWindow(page.messages);
        if (page.reconcile) {
            void page.reconcile.then(fresh => messageStore.mergeHistoryMessages(sessionKey, fresh));
        }
    } catch (e) {
        console.error('[messageJump] return to latest failed:', e);
    } finally {
        if (sessionStore.currentSessionKey === sessionKey) messageStore.setLoading(false);
    }
}
