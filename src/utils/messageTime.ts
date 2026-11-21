/**
 * 聊天窗口的时间分组：发送时间相近的消息归为一组，只在组首那条的上方显示一个时间戳。
 * 这里都是纯函数；「今天」由调用方传入（见 composables/useToday），跨天后重新计算就得到新的写法
 */

import { Renderer_Config } from '@shared/config/constants';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

/** 所在自然日零点（本地时区）的时间戳 */
export function startOfDay(timestamp: number): number {
    const date = new Date(timestamp);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
}

/** 个别消息没有发送时间（转换时落成 0）：不给它显示时间戳，也不拿它算间隔 */
const hasTime = (timestamp: number | undefined): timestamp is number => !!timestamp && timestamp > 0;

/**
 * 这条消息是否另起一个时间分组（上方显示时间戳）：没有上一条、与上一条相差超过间隔、或与上一条不在同一天。
 * 只看相邻两条的发送时间，与当前时间无关；往更早翻页时，除了原来的第一条，其余消息的分组都不会变
 */
export function startsTimeGroup(sendTime: number, previousSendTime: number | undefined): boolean {
    if (!hasTime(sendTime)) return false;
    if (!hasTime(previousSendTime)) return true;
    return Math.abs(sendTime - previousSendTime) > Renderer_Config.messageTimeGroupGapMs
        || startOfDay(sendTime) !== startOfDay(previousSendTime);
}

/**
 * 时间戳的文字，today 传「今天零点」的时间戳：
 * 今天 10:30 ／ 昨天 10:30 ／ 星期二 10:30（2～6 天前）／ 11月3日 10:30（今年）／ 2025年11月3日 10:30
 */
export function formatMessageTime(sendTime: number, today: number): string {
    if (!hasTime(sendTime)) return '';
    const date = new Date(sendTime);
    const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

    // 按自然日算相差几天；四舍五入抵消夏令时造成的 23 / 25 小时的一天
    const daysAgo = Math.round((today - startOfDay(sendTime)) / DAY_MS);
    // 本机时间比服务端慢时，消息可能落在「明天」，同样只显示时间
    if (daysAgo <= 0) return time;
    if (daysAgo === 1) return `昨天 ${time}`;
    if (daysAgo < 7) return `${WEEKDAYS[date.getDay()]} ${time}`;

    const monthDay = `${date.getMonth() + 1}月${date.getDate()}日`;
    return date.getFullYear() === new Date(today).getFullYear()
        ? `${monthDay} ${time}`
        : `${date.getFullYear()}年${monthDay} ${time}`;
}

/**
 * 会话列表摘要时间：今天 HH:mm ／ 昨天 ／ MM-DD
 */
export function formatSessionTime(timestamp: number | null | undefined): string {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const todayStart = startOfDay(Date.now());
    const daysAgo = Math.round((todayStart - startOfDay(timestamp)) / DAY_MS);

    if (daysAgo === 0) {
        return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    }
    if (daysAgo === 1) return '昨天';
    return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * 历史消息日期分隔标题：今天 ／ 昨天 ／ 11月3日 星期二 ／ 2025年11月3日 星期二
 */
export function formatDateDivider(timestamp: number): string {
    const now = new Date();
    const todayStart = startOfDay(now.getTime());
    const daysAgo = Math.round((todayStart - startOfDay(timestamp)) / DAY_MS);

    if (daysAgo === 0) return '今天';
    if (daysAgo === 1) return '昨天';

    const d = new Date(timestamp);
    const monthDay = `${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAYS[d.getDay()]}`;
    return d.getFullYear() === now.getFullYear() ? monthDay : `${d.getFullYear()}年${monthDay}`;
}
