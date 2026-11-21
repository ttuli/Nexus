/**
 * 历史消息窗口的列表状态。只在历史窗口这个渲染进程里用，跟主窗口的 message store 互不相干。
 *
 * 列表是本地检索结果上的一段「滑动窗口」：按 seq 升序，最多 MAX_WINDOW 条。往更早翻时从最新那头丢，
 * 往更新翻时从最早那头丢，丢掉的随时能按 seq 从本地库查回来；hasOlder / hasNewer 表示两头之外还有没有。
 * 类型 / 关键词筛选在 SQL 里做，这里不再过滤，只剔除撤回的消息（removeRecalled 记下的 msgId）。
 *
 * 纯状态 + 同步修改，不做 I/O：取数由 useMessageHistory 编排，撤回推送由 historyListener 调 removeRecalled。
 * 用 setup 写法是为了 shallowRef：列表只整体替换、不原地改，免得 Pinia 默认的深层响应式给几百条消息逐个套代理。
 */
import { computed, ref, shallowRef } from 'vue';
import { defineStore } from 'pinia';
import type { HistoryMessageCategory, IChatMessage } from '@shared/types/chatMessage';

/** 列表最多保留的条数（每页 30 条，约 10 页） */
export const MAX_WINDOW = 300;

/** 加载的是哪一头：最新一页（打开、换筛选、回到最新、重试）/ 更早的一页 / 更新的一页 */
export type HistoryLoad = 'latest' | 'older' | 'newer';

/** 历史记录的筛选条件 */
export interface HistoryFilter {
    /** 只看这一类消息；为空表示全部 */
    category?: HistoryMessageCategory;
    /** 关键词（已去掉首尾空白）；空串表示不按关键词筛选 */
    keyword: string;
}

export const historyMessageKey = (msg: IChatMessage): string => msg.msgId || msg.clientId || '';

export const useHistoryStore = defineStore('history', () => {
    const sessionKey = ref('');
    const filter = shallowRef<HistoryFilter>({ keyword: '' });
    const isFiltering = computed(() => !!filter.value.category || !!filter.value.keyword);
    /** 按 seq 升序，末条最新 */
    const messages = shallowRef<IChatMessage[]>([]);
    /**
     * 列表整体换成另一批结果（换会话、换筛选、回到最新、重试）时自增。同一条消息在不同结果里行高可能不同
     * （是否带日期分隔、文件名标注），页面据此丢掉上一批的实测行高
     */
    const resultVersion = ref(0);
    /** 正在加载哪一头；同一时间只有一个加载 */
    const loading = ref<HistoryLoad | null>(null);
    /** 哪一头加载失败（读本地库出错）；失败后那一头不再随滚动自动重试，等用户点「重试」 */
    const failed = ref<HistoryLoad | null>(null);
    /** 列表最早一条之前还有没有（没翻到顶） */
    const hasOlder = ref(true);
    /** 列表最新一条之后还有没有（往上翻时从最新那头丢过） */
    const hasNewer = ref(false);

    /**
     * 窗口打开期间被撤回的消息。撤回落库之后的查询本来就查不到它们；记下来是为了剔除
     * 撤回前就发出、之后才返回的在途结果。不需要响应式；msgId 全局唯一，换会话也不用清
     */
    const recalledIds = new Set<string>();
    const withoutRecalled = (page: IChatMessage[]) =>
        recalledIds.size === 0 ? page : page.filter(m => !recalledIds.has(m.msgId));

    /** 换会话：清空列表，筛选条件复位 */
    function reset(key: string) {
        sessionKey.value = key;
        filter.value = { keyword: '' };
        messages.value = [];
        resultVersion.value++;
        loading.value = null;
        failed.value = null;
        hasOlder.value = true;
        hasNewer.value = false;
    }

    function setFilter(next: HistoryFilter) {
        filter.value = next;
    }

    function setLoading(load: HistoryLoad | null) {
        loading.value = load;
    }

    function setFailed(load: HistoryLoad | null) {
        failed.value = load;
    }

    /** 清空列表（最新一页加载失败时：筛选条件已经变了，旧结果不能留着冒充新结果） */
    function clearMessages() {
        messages.value = [];
        resultVersion.value++;
    }

    /**
     * 用最新一页整体替换列表（打开、换筛选、回到最新、重试）
     * @param full 查询返回了整页：更早的可能还有
     */
    function replaceWithLatest(page: IChatMessage[], full: boolean) {
        messages.value = withoutRecalled(page);
        resultVersion.value++;
        hasOlder.value = full;
        hasNewer.value = false;
    }

    /**
     * 往更早翻：插到头部；超出上限时从最新那头丢掉多出的，之后要往下翻回来
     * @param full 查询返回了整页：更早的可能还有
     * @returns 新增的条数
     */
    function prependOlder(page: IChatMessage[], full: boolean): number {
        const known = new Set(messages.value.map(historyMessageKey));
        const older = withoutRecalled(page).filter(m => !known.has(historyMessageKey(m)));
        let next = [...older, ...messages.value];
        if (next.length > MAX_WINDOW) {
            next = next.slice(0, MAX_WINDOW);
            hasNewer.value = true;
        }
        messages.value = next;
        hasOlder.value = full;
        return older.length;
    }

    /**
     * 往更新翻：接到尾部；超出上限时从最早那头丢掉多出的，之后要往上翻回来
     * @param full 查询返回了整页：更新的可能还有
     * @returns 新增的条数
     */
    function appendNewer(page: IChatMessage[], full: boolean): number {
        const known = new Set(messages.value.map(historyMessageKey));
        const newer = withoutRecalled(page).filter(m => !known.has(historyMessageKey(m)));
        let next = [...messages.value, ...newer];
        if (next.length > MAX_WINDOW) {
            next = next.slice(next.length - MAX_WINDOW);
            hasOlder.value = true;
        }
        messages.value = next;
        hasNewer.value = full;
        return newer.length;
    }

    /**
     * 消息被撤回（主进程在撤回落库后推送）：从列表移除，并记下来剔除之后返回的在途结果
     * @returns 列表里实际移除的条数
     */
    function removeRecalled(msgIds: string[]): number {
        msgIds.forEach(id => { if (id) recalledIds.add(id); });
        const before = messages.value.length;
        const next = withoutRecalled(messages.value);
        if (next.length !== before) messages.value = next;
        return before - next.length;
    }

    return {
        sessionKey, filter, isFiltering, messages, resultVersion, loading, failed, hasOlder, hasNewer,
        reset, setFilter, setLoading, setFailed, clearMessages,
        replaceWithLatest, prependOlder, appendNewer, removeRecalled,
    };
});
