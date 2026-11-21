import { readonly, ref } from 'vue';
import { startOfDay } from '@/src/utils/messageTime';

/** 多久核对一次日期 */
const CHECK_INTERVAL_MS = 60 * 1000;

/**
 * 今天零点（本地时区）的时间戳，同一个窗口里共用一个。
 * 界面上「今天 / 昨天 / 星期几」这类写法靠它来算：跨天后它变一次，用到它的地方随之重新计算
 */
const today = ref(startOfDay(Date.now()));
let watching = false;

/** 日期没变时赋的是同一个数，不触发任何更新，所以核对本身几乎没有开销 */
const refresh = () => {
    today.value = startOfDay(Date.now());
};

/**
 * 不只定时到零点：休眠期间定时器不走，改系统时间或时区也会让它算错。
 * 所以每分钟核对一次，窗口重新获得焦点、从隐藏恢复显示时各再核对一次
 */
function startWatching(): void {
    if (watching) return;
    watching = true;
    setInterval(refresh, CHECK_INTERVAL_MS);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
}

/** 「今天零点」的只读响应式值。首次调用时才开始核对，没用到它的窗口不会多出一个定时器 */
export function useToday() {
    startWatching();
    refresh();
    return readonly(today);
}
