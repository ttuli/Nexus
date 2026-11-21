<template>
    <div class="history-window">
        <TitleBar class="title-bar" title="历史消息" :need-max="true" />

        <!-- 搜索栏：关键词 + 消息类型筛选，都只查本地记录 -->
        <div class="search-panel">
            <div class="search-box">
                <Search class="app-icon app-icon--sm search-icon" />
                <input v-model="keywordInput" class="search-input" placeholder="搜索文字或文件名" spellcheck="false"
                    @keydown.enter="applyFilterNow" @keydown.esc="clearKeyword" />
                <span v-show="keywordInput" class="clear-btn" title="清空" @click="clearKeyword">
                    <CloseCircle class="app-icon app-icon--sm" />
                </span>
            </div>
            <div class="category-tabs">
                <span v-for="tab in CATEGORY_TABS" :key="tab.label" class="category-tab"
                    :class="{ active: activeCategory === tab.value }" @click="selectCategory(tab.value)">
                    {{ tab.label }}
                </span>
            </div>
        </div>

        <!-- 滚轮不会触发菜单的外部点击关闭，菜单是 fixed 定位，内容滚走后就对不上了，主动关掉 -->
        <div ref="listRef" class="history-list scroll-bar-thin" @scroll="handleScroll" @wheel.passive="closeMenu">
            <!-- 容器常驻，不随有无消息 v-if：与行同批新建时，行的 ref 回调触发时还没插进文档，
                 量出的高度是 0，要等 ResizeObserver 下一帧才校正，首屏滚到底会停在半路 -->
            <div class="virtual-container" :style="{ height: `${virtualizer.getTotalSize()}px` }">
                <!-- 位于列表顶部的留白里（paddingStart），状态切换不会挤动列表 -->
                <div v-if="messages.length > 0" class="list-status">
                    <template v-if="loading === 'older'">
                        <span class="spinner"></span>
                        <span>加载中…</span>
                    </template>
                    <template v-else-if="failed === 'older'">
                        <span>加载失败</span>
                        <span class="retry" @click="retryOlder">重试</span>
                    </template>
                    <span v-else-if="!hasOlder">没有更早的消息了</span>
                </div>

                <div v-for="row in virtualizer.getVirtualItems()" :key="String(row.key)"
                    :ref="el => { if (el) virtualizer.measureElement(el as Element) }" :data-index="row.index"
                    class="virtual-row" :style="{ transform: `translateY(${row.start}px)` }">
                    <HistoryMessageItem :message="messages[row.index]" :group-id="groupId" :keyword="filter.keyword"
                        :date-label="dateLabelAt(row.index)" @jump="jumpTo" @contextmenu="openMenu" />
                </div>

                <!-- 往上翻时丢掉过最新那头：底部留白（paddingEnd）里显示往下加载的状态 -->
                <div v-if="messages.length > 0 && hasNewer" class="list-status at-bottom">
                    <template v-if="loading === 'newer'">
                        <span class="spinner"></span>
                        <span>加载中…</span>
                    </template>
                    <template v-else-if="failed === 'newer'">
                        <span>加载失败</span>
                        <span class="retry" @click="retryNewer">重试</span>
                    </template>
                </div>
            </div>

            <div v-if="messages.length === 0" class="list-empty">
                <template v-if="loading === 'latest'">
                    <span class="spinner"></span>
                    <span>加载中…</span>
                </template>
                <template v-else-if="failed === 'latest'">
                    <span>加载失败</span>
                    <span class="retry" @click="showLatestPage">重试</span>
                </template>
                <template v-else-if="filter.category === 'audio' && filter.keyword">
                    <span>语音消息不支持关键词搜索</span>
                    <span class="retry" @click="clearKeyword">清空关键词</span>
                </template>
                <span v-else>{{ isFiltering ? '没有找到相关消息' : '暂无消息' }}</span>
            </div>
        </div>

        <div v-if="hasNewer" class="back-to-latest" @click="showLatestPage">回到最新</div>

        <ContextMenu v-model:visible="menuVisible" :x="menuX" :y="menuY" :options="MENU_OPTIONS"
            @select="handleMenuSelect" @close="menuTarget = null" />
    </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { storeToRefs } from 'pinia';
import { useVirtualizer } from '@tanstack/vue-virtual';
import { CloseCircle, Gps, Search } from 'reicon-vue';
import type { IChatMessage, HistoryMessageCategory, HistoryWindowConfig } from '@shared/types';
import { windowService } from '@/src/services';
import { useHistoryStore, historyMessageKey } from '@/src/store/history';
import { useMessageHistory } from '@/src/composables/useMessageHistory';
import { signalWindowReady } from '@/src/utils/window';
import { isGroupSession } from '@/src/utils/sessionUtils';
import { startOfDay, formatDateDivider } from '@/src/utils/messageTime';
import ContextMenu, { type MenuOption } from '@/src/components/ContextMenu.vue';
import HistoryMessageItem from './components/HistoryMessageItem.vue';

/** 顶部「加载中 / 没有更早的消息了」所占高度，同时是虚拟列表的 paddingStart（底部有更新的消息时也留这么高） */
const STATUS_HEIGHT = 40;
/** 离顶部 / 底部小于这个距离就开始加载更早 / 更新的一页 */
const LOAD_THRESHOLD = 240;
/** 输入关键词停顿这么久再查 */
const KEYWORD_DEBOUNCE_MS = 300;
const CATEGORY_TABS: { label: string; value?: HistoryMessageCategory }[] = [
    { label: '全部' },
    { label: '文本', value: 'text' },
    { label: '语音', value: 'audio' },
    { label: '图片', value: 'image' },
    { label: '文件', value: 'file' },
    { label: '视频', value: 'video' },
];

const route = useRoute();

const {
    sessionKey, filter, isFiltering, messages, resultVersion, loading, failed, hasOlder, hasNewer,
} = storeToRefs(useHistoryStore());
const { open, setFilter, reloadLatest, loadOlder, loadNewer, retryOlder, retryNewer } = useMessageHistory();

const groupId = computed(() =>
    sessionKey.value && isGroupSession(sessionKey.value) ? Number(sessionKey.value) : undefined,
);

// ─── 虚拟列表 ───────────────────────────────────────────────────────────────

const listRef = ref<HTMLElement | null>(null);

const virtualizer = useVirtualizer(computed(() => ({
    count: messages.value.length,
    getScrollElement: () => listRef.value,
    estimateSize: () => 72,
    overscan: 8,
    paddingStart: STATUS_HEIGHT,
    paddingEnd: hasNewer.value ? STATUS_HEIGHT : 12,
    getItemKey: (index: number) => {
        const msg = messages.value[index];
        if (!msg) return index;
        // 带不带日期分隔会改变行高，而它取决于前一条：往更早翻、从头部丢弃时首尾附近的行会变。
        // 作为 key 的一部分，变了就当新行重新测量，免得沿用旧的实测高度
        return `${historyMessageKey(msg) || index}${startsNewDay(index) ? '|d' : ''}`;
    },
})));

// 列表整体换成另一批结果：丢掉上一批的实测行高。同一条消息在不同结果里行高可能不同（日期分隔、文件名标注），
// 沿用旧高度时，滚到底后才按实际高度修正、而往回滚动中的修正虚拟列表不补偿滚动位置，会停在离底部还差一截的地方
watch(resultVersion, () => virtualizer.value.measure());

const scrollToBottom = () => {
    const last = messages.value.length - 1;
    // 动态高度下首屏只有估算值，scrollToIndex 会在后续几帧里随实测高度自行校正到真正的底部
    if (last >= 0) virtualizer.value.scrollToIndex(last, { align: 'end' });
};

/**
 * 视口里第一条在新列表里仍然存在的消息，以及它离视口顶部的距离。在 DOM 更新前调用，读到的是旧的行
 */
const findAnchor = (el: HTMLElement, prev: IChatMessage[], next: IChatMessage[]) => {
    const viewTop = el.getBoundingClientRect().top;
    const nextKeys = new Set(next.map(historyMessageKey));
    const rows = [...el.querySelectorAll<HTMLElement>('.virtual-row')]
        .map(row => ({ row, index: Number(row.dataset.index) }))
        .sort((a, b) => a.index - b.index);
    for (const { row, index } of rows) {
        const rect = row.getBoundingClientRect();
        const key = prev[index] && historyMessageKey(prev[index]);
        if (rect.bottom > viewTop && key && nextKeys.has(key)) return { key, offset: rect.top - viewTop };
    }
    return null;
};

// 列表局部变化时，视口里正在看的内容保持不动：往更早翻（头部插入、超出上限时尾部丢弃）、
// 往更新翻（尾部追加、头部丢弃）、撤回移除。DOM 更新前记下锚点消息离视口顶部的距离，
// 更新后按它在新列表里的位置补回 scrollTop。换会话、换筛选、回到最新是整体替换，之后会滚到最新一条。
// watch 默认在组件更新前执行，此时 DOM 还是旧的
watch(messages, (next, prev) => {
    const el = listRef.value;
    if (!el || prev.length === 0 || next.length === 0) return;
    const anchor = findAnchor(el, prev, next);
    if (anchor) {
        nextTick(() => {
            const index = next.findIndex(m => historyMessageKey(m) === anchor.key);
            // 渲染新行时已经实测了一部分高度，但 measurementsCache 要等下次重算才更新：先调 getVirtualItems() 让它按
            // 最新的实测高度重算，再取锚点的位置。还没渲染过的行按估算高度排位，之后实测出的差值都在视口上方，虚拟列表会自己补偿
            virtualizer.value.getVirtualItems();
            const item = virtualizer.value.measurementsCache[index];
            if (item) el.scrollTop = item.start - anchor.offset;
        });
    }
    // 撤回移除后可能撑不满窗口，没有滚动条就不会触发翻页，补一次
    if (next.length < prev.length && !loading.value) void nextTick().then(fillViewport);
});

const handleScroll = () => {
    const el = listRef.value;
    if (!el) return;
    if (el.scrollTop < LOAD_THRESHOLD) void loadOlder();
    else if (hasNewer.value && el.scrollHeight - el.scrollTop - el.clientHeight < LOAD_THRESHOLD) void loadNewer();
};

/**
 * 消息少到撑不满窗口时不会有滚动事件，主动加载（先往更早，到顶了再往更新），直到出现滚动条或两头都没有了，
 * 另设轮数上限兜底
 */
const fillViewport = async () => {
    const el = listRef.value;
    for (let round = 0; round < 10 && el && el.scrollHeight <= el.clientHeight; round++) {
        if (hasOlder.value && failed.value !== 'older') await loadOlder();
        else if (hasNewer.value && failed.value !== 'newer') await loadNewer();
        else break;
        await nextTick();
    }
};

/** 列表整体换了一批（换会话、换筛选、重试、回到最新）：停在最新一条，消息少到撑不满时继续往前加载 */
const showLatest = async () => {
    await nextTick();
    scrollToBottom();
    await fillViewport();
};

// ─── 搜索栏 ─────────────────────────────────────────────────────────────────

const keywordInput = ref('');
const activeCategory = ref<HistoryMessageCategory>();
let keywordTimer: ReturnType<typeof setTimeout> | undefined;

/** 按搜索栏当前的关键词和类型重新加载（条件没变时什么都不做） */
const applyFilterNow = async () => {
    clearTimeout(keywordTimer);
    if (!(await setFilter({ category: activeCategory.value, keyword: keywordInput.value }))) return;
    await showLatest();
};

// 输入时停顿一下再查；输入法组字期间 v-model 不更新，不会按半个词去查
watch(keywordInput, () => {
    clearTimeout(keywordTimer);
    keywordTimer = setTimeout(applyFilterNow, KEYWORD_DEBOUNCE_MS);
});

const selectCategory = (category?: HistoryMessageCategory) => {
    activeCategory.value = category;
    void applyFilterNow();
};

const clearKeyword = () => {
    keywordInput.value = '';
    void applyFilterNow();
};

const openSession = async (key: string) => {
    // 换会话时搜索栏一并复位，与 open 清空的筛选条件保持一致
    clearTimeout(keywordTimer);
    // 菜单里记的是上一个会话的消息，不能再拿它按新会话跳转
    closeMenu();
    keywordInput.value = '';
    activeCategory.value = undefined;
    if (!(await open(key))) return;
    await showLatest();
};

/** 首屏加载失败后点「重试」、往上翻得太远（最新那头已被丢弃）后点「回到最新」：重新加载最新一页并停在最新一条 */
const showLatestPage = async () => {
    if (!(await reloadLatest())) return;
    await showLatest();
};

// ─── 日期分隔 ───────────────────────────────────────────────────────────────

/** 本条是否与上一条不在同一天（列表首条总算新的一天） */
const startsNewDay = (index: number) => {
    const current = messages.value[index];
    if (!current) return false;
    const previous = messages.value[index - 1];
    return !previous || startOfDay(previous.sendTime) !== startOfDay(current.sendTime);
};

/** 与上一条不在同一天时，在本条上方显示日期 */
const dateLabelAt = (index: number) => {
    const current = messages.value[index];
    return current && startsNewDay(index) ? formatDateDivider(current.sendTime) : '';
};

// ─── 双击跳转 ───────────────────────────────────────────────────────────────

/** 双击某条消息：让主窗口定位到它并闪烁（主窗口会被唤到前台；没加载的以它为锚点加载前后两页） */
const jumpTo = (message: IChatMessage) => {
    if (!sessionKey.value || !message.msgId) return;
    windowService.jumpToMessage({ sessionKey: sessionKey.value, msgId: message.msgId, seq: message.seq });
};

// ─── 右键菜单 ───────────────────────────────────────────────────────────────

const MENU_OPTIONS: MenuOption[] = [
    { label: '跳转到此处', key: 'jump', icon: Gps },
];

const menuVisible = ref(false);
const menuX = ref(0);
const menuY = ref(0);
/** 弹出菜单时右键的那条消息（虚拟列表滚动时行会被卸载，所以记消息本身而不是行） */
const menuTarget = ref<IChatMessage | null>(null);

const openMenu = (event: MouseEvent, message: IChatMessage) => {
    menuTarget.value = message;
    menuX.value = event.clientX;
    menuY.value = event.clientY;
    menuVisible.value = true;
};

const closeMenu = () => {
    menuVisible.value = false;
    menuTarget.value = null;
};

const handleMenuSelect = (option: MenuOption) => {
    const target = menuTarget.value;
    if (!target) return;
    if (option.key === 'jump') jumpTo(target);
};

// ─── 窗口参数 ───────────────────────────────────────────────────────────────

// 窗口已打开时从别的会话再点「历史消息」：主进程把新会话推过来，原地切换
windowService.onWindowData<HistoryWindowConfig>((data) => {
    if (data?.sessionKey && data.sessionKey !== sessionKey.value) void openSession(data.sessionKey);
});

// 窗口打开期间被撤回的消息由 historyListener 从 store 里移除（见 listeners/index.ts 按窗口登记的监听）

onMounted(() => {
    signalWindowReady();
    const key = route.query.sessionKey as string;
    if (key) void openSession(key);
});

onBeforeUnmount(() => {
    clearTimeout(keywordTimer);
    windowService.offWindowData();
});
</script>

<style scoped lang="scss">
.history-window {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    background-color: $bg-body;
    overflow: hidden;
    transition: background-color $transition-base;

    .title-bar {
        flex-shrink: 0;
        background: var(--surface-default, #ffffff);
        border-bottom: 1px solid var(--border-divider, #ececec);
        transition: background-color $transition-base, border-color $transition-base;

        [data-theme='dark'] & {
            background: var(--surface-default, #1e293b);
            border-bottom: 1px solid var(--border-color, #334155);
        }

        @supports (backdrop-filter: blur(10px)) or (-webkit-backdrop-filter: blur(10px)) {
            background: rgba(255, 255, 255, 0.8);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);

            [data-theme='dark'] & {
                background: rgba(30, 41, 59, 0.8);
            }
        }
    }

    .search-panel {
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 10px 22px 6px;
        -webkit-app-region: no-drag;

        .search-box {
            height: 32px;
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 0 10px;
            box-sizing: border-box;
            border: 1px solid $color-border;
            border-radius: 6px;
            background-color: $bg-card;
            transition: border-color 0.2s ease;

            &:focus-within {
                border-color: $color-primary;
            }

            .search-icon {
                color: $color-text-placeholder;
            }

            .search-input {
                flex: 1;
                min-width: 0;
                height: 100%;
                padding: 0;
                border: none;
                outline: none;
                background: none;
                font-size: 13px;
                color: $color-text-primary;

                &::placeholder {
                    color: $color-text-placeholder;
                }
            }

            .clear-btn {
                display: flex;
                color: $color-text-placeholder;
                cursor: pointer;

                &:hover {
                    color: $color-text-secondary;
                }
            }
        }

        .category-tabs {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;

            .category-tab {
                padding: 3px 10px;
                border-radius: 12px;
                font-size: 12px;
                line-height: 18px;
                color: $color-text-secondary;
                cursor: pointer;
                user-select: none;
                transition: background-color 0.15s ease, color 0.15s ease;

                &:hover {
                    background-color: $bg-hover;
                    color: $color-text-primary;
                }

                &.active {
                    background-color: $color-primary-bg;
                    color: $color-primary;
                    font-weight: $font-weight-medium;
                }
            }
        }
    }

    .history-list {
        position: relative;
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        // 头部插入由代码补偿滚动位置，关掉浏览器自带的滚动锚定，避免两边一起补
        overflow-anchor: none;
        -webkit-app-region: no-drag;

        .virtual-container {
            position: relative;
            width: 100%;
        }

        .list-status {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            font-size: 12px;
            color: $color-text-placeholder;

            &.at-bottom {
                top: auto;
                bottom: 0;
            }
        }

        .virtual-row {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
        }

        .list-empty {
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            font-size: 13px;
            color: $color-text-placeholder;
        }

        .retry {
            color: $color-primary;
            cursor: pointer;

            &:hover {
                text-decoration: underline;
            }
        }
    }

    .back-to-latest {
        position: absolute;
        right: 22px;
        bottom: 18px;
        z-index: 2;
        padding: 6px 14px;
        border: 1px solid $color-border;
        border-radius: 16px;
        background-color: $bg-card;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
        font-size: 12px;
        color: $color-primary;
        cursor: pointer;
        user-select: none;
        -webkit-app-region: no-drag;
        transition: background-color 0.15s ease;

        &:hover {
            background-color: $bg-hover;
        }
    }

    .spinner {
        width: 12px;
        height: 12px;
        box-sizing: border-box;
        border: 2px solid $color-border;
        border-top-color: $color-primary;
        border-radius: 50%;
        animation: history-spin 0.8s linear infinite;
    }
}

@keyframes history-spin {
    to {
        transform: rotate(360deg);
    }
}
</style>
