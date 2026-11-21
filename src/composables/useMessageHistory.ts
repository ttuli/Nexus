/**
 * 历史消息窗口的取数编排：打开会话 → 预取发送者资料 → 加载最新一页；往上 / 往下滚动时逐页加载更早 / 更新的消息；
 * 切换类型筛选或关键词、点「回到最新」时，从最新一页重新加载。
 *
 * 消息只读本地 SQLite（messageService.searchLocalHistory），不回源服务端；筛选在 SQL 里做，每页都是凑满的可显示消息。
 * 列表状态在 useHistoryStore（滑动窗口，两头超出上限时丢弃）；本模块只管取数、作废过期请求、复用在途请求。
 * 也可注入别的数据源（测试用）。
 */
import { watch } from 'vue';
import type { IChatMessage, LocalHistoryQuery } from '@shared/types/chatMessage';
import { messageService } from '@/src/services';
import { useUserStore } from '@/src/store/user';
import { useHistoryStore, type HistoryFilter } from '@/src/store/history';
import { useFriendActions } from '@/src/composables/useFriendActions';
import { useGroupActions } from '@/src/composables/useGroupActions';
import { isGroupSession } from '@/src/utils/sessionUtils';

/**
 * 历史消息分页数据源：按 query 的方向返回一页符合条件的消息，按 seq 升序（末条最新）。
 * 不足 limit 条表示那个方向没有更多了
 */
export type HistoryPageFetcher = (sessionKey: string, query: LocalHistoryQuery) => Promise<IChatMessage[]>;

const PAGE_SIZE = 30;
/** 等本窗口拿到登录 token 的上限；超时后照常加载（预取发送者资料要走服务端） */
const LOGIN_WAIT_MS = 3000;

const fetchLocalPage: HistoryPageFetcher = (key, query) => messageService.searchLocalHistory(key, query);

export function useMessageHistory(fetchPage: HistoryPageFetcher = fetchLocalPage) {
    const store = useHistoryStore();
    const userStore = useUserStore();
    const { loadFriendList, loadUserInfos } = useFriendActions();
    const { loadGroupMembers } = useGroupActions();

    /** 本窗口的 token 由 App.vue 异步取回；先等它到位，免得预取资料的首个请求带空 token 白白触发一次刷新 */
    const waitForLogin = (): Promise<void> => {
        if (userStore.getToken()) return Promise.resolve();
        return new Promise(resolve => {
            const timer = setTimeout(done, LOGIN_WAIT_MS);
            const stop = watch(() => userStore.token, token => { if (token) done(); });
            function done() {
                clearTimeout(timer);
                stop();
                resolve();
            }
        });
    };

    /** 每次重新加载最新一页（打开会话、切换筛选、回到最新）自增：之前还在途的请求结果直接丢弃 */
    let generation = 0;
    let friendsLoaded = false;
    /** 在途的翻页：滚动和撑满视口可能同时触发，共用同一个请求（同一时间只有一个方向在加载） */
    let inflight: Promise<number> | null = null;

    /**
     * 预取显示名要用的数据：好友备注、群昵称。本窗口的 store 一开始是空的，
     * 不预取就只能显示用户名（走主进程资源缓存，已缓存的立即返回）
     */
    const preloadNameSources = async (key: string) => {
        await waitForLogin();
        const tasks: Promise<unknown>[] = [];
        if (!friendsLoaded) {
            tasks.push(loadFriendList().then(() => { friendsLoaded = true; }));
        }
        if (isGroupSession(key)) {
            tasks.push(loadGroupMembers(Number(key)));
        }
        await Promise.allSettled(tasks);
    };

    /** 补齐这一页里还没缓存的发送者资料（头像、用户名） */
    const loadSenders = (page: IChatMessage[]) => {
        const ids = [...new Set(page.map(m => m.fromUserId))].filter(id => id && !userStore.getUser(id));
        if (ids.length > 0) void loadUserInfos(ids);
    };

    const queryOf = (cursor: Pick<LocalHistoryQuery, 'beforeSeq' | 'afterSeq'>): LocalHistoryQuery => ({
        ...cursor,
        limit: PAGE_SIZE,
        category: store.filter.category,
        keyword: store.filter.keyword || undefined,
    });

    /**
     * 按当前会话和筛选条件加载最新一页，整体替换列表。替换前旧列表保留到新结果到达，免得闪一下空白
     * （换会话时由 open 先清空）
     * @param prepare 与首页并行、首页显示前要等完的准备工作（预取发送者资料）
     * @returns 本次加载是否仍有效（期间又重新加载过则为 false，调用方不必再做后续处理）
     */
    const reload = async (prepare?: Promise<unknown>): Promise<boolean> => {
        const gen = ++generation;
        inflight = null;
        store.setFailed(null);
        store.setLoading('latest');
        try {
            const [page] = await Promise.all([fetchPage(store.sessionKey, queryOf({})), prepare]);
            if (gen !== generation) return false;
            store.replaceWithLatest(page, page.length >= PAGE_SIZE);
            loadSenders(page);
        } catch (e) {
            console.error('[useMessageHistory] load failed:', e);
            if (gen === generation) {
                store.clearMessages();
                store.setFailed('latest');
            }
        } finally {
            if (gen === generation) store.setLoading(null);
        }
        return gen === generation;
    };

    /** 打开会话：清空列表和筛选条件，加载最新一页 */
    const open = (key: string): Promise<boolean> => {
        store.reset(key);
        return reload(preloadNameSources(key));
    };

    /**
     * 切换筛选条件，从最新一页重新加载
     * @returns 是否重新加载了且结果仍有效；条件没变时不加载，返回 false
     */
    const setFilter = (next: HistoryFilter): Promise<boolean> => {
        const keyword = next.keyword.trim();
        const current = store.filter;
        if (!store.sessionKey || (next.category === current.category && keyword === current.keyword)) {
            return Promise.resolve(false);
        }
        store.setFilter({ category: next.category, keyword });
        return reload();
    };

    /** 首屏加载失败后点「重试」、点「回到最新」：保留筛选条件，重新加载最新一页 */
    const reloadLatest = (): Promise<boolean> => reload();

    const fetchMore = async (direction: 'older' | 'newer', cursor: string): Promise<number> => {
        const gen = generation;
        store.setLoading(direction);
        try {
            const query = queryOf(direction === 'older' ? { beforeSeq: cursor } : { afterSeq: cursor });
            const page = await fetchPage(store.sessionKey, query);
            if (gen !== generation) return 0;
            // 是否还有更多按查询返回的原始条数判断，剔除撤回只影响显示
            const full = page.length >= PAGE_SIZE;
            const added = direction === 'older' ? store.prependOlder(page, full) : store.appendNewer(page, full);
            if (added > 0) loadSenders(page);
            return added;
        } catch (e) {
            console.error(`[useMessageHistory] load ${direction} failed:`, e);
            if (gen === generation) store.setFailed(direction);
            return 0;
        } finally {
            if (gen === generation) store.setLoading(null);
        }
    };

    /**
     * 往更早 / 更新的方向加载一页。游标就是列表两头的 seq：每页都是筛选后的可显示消息
     * @returns 新增的条数
     */
    const loadMore = (direction: 'older' | 'newer'): Promise<number> => {
        if (inflight) return inflight;
        const list = store.messages;
        const cursor = direction === 'older' ? list[0]?.seq : list[list.length - 1]?.seq;
        const more = direction === 'older' ? store.hasOlder : store.hasNewer;
        if (store.loading || store.failed === direction || !more || !store.sessionKey || !cursor) {
            return Promise.resolve(0);
        }

        const task = fetchMore(direction, cursor);
        inflight = task;
        void task.finally(() => {
            if (inflight === task) inflight = null;
        });
        return task;
    };

    const loadOlder = () => loadMore('older');
    const loadNewer = () => loadMore('newer');

    /** 翻页失败后点「重试」 */
    const retryMore = (direction: 'older' | 'newer'): Promise<number> => {
        if (store.failed === direction) store.setFailed(null);
        return loadMore(direction);
    };

    return {
        open,
        setFilter,
        reloadLatest,
        loadOlder,
        loadNewer,
        retryOlder: () => retryMore('older'),
        retryNewer: () => retryMore('newer'),
    };
}
