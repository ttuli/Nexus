/**
 * Lamport seq 工具
 *
 * 后端 seq 已从「连续递增序号」改为 Lamport 序号（42bit 毫秒时间戳 | 10bit 节点 | 12bit 计数器），
 * 数值超出 JS Number 安全整数范围（2^53），proto 层以 string 承载，本模块提供基于 BigInt 的
 * 比较/规整能力。注意：Lamport seq 不连续，任何 +1/-1 只能作为区间边界使用，不能推断消息数量。
 */

/** 规整任意输入为十进制 seq 字符串；非法/空值返回 '0' */
export function toSeq(value: unknown): string {
    if (value === null || value === undefined) return '0';
    try {
        return BigInt(typeof value === 'string' && value.trim() === '' ? '0' : (value as string | number | bigint)).toString();
    } catch {
        return '0';
    }
}

/** seq 是否为有效正值 */
export function seqPositive(value: unknown): boolean {
    try {
        return BigInt(toSeq(value)) > 0n;
    } catch {
        return false;
    }
}

/** a > b */
export function seqGt(a: unknown, b: unknown): boolean {
    return BigInt(toSeq(a)) > BigInt(toSeq(b));
}

/** a < b */
export function seqLt(a: unknown, b: unknown): boolean {
    return BigInt(toSeq(a)) < BigInt(toSeq(b));
}

/** 数值比较，返回 -1/0/1，可直接用于 sort */
export function seqCompare(a: unknown, b: unknown): number {
    const x = BigInt(toSeq(a));
    const y = BigInt(toSeq(b));
    return x < y ? -1 : x > y ? 1 : 0;
}

/** 取较大值（返回规整后的字符串） */
export function seqMax(a: unknown, b: unknown): string {
    return seqGt(a, b) ? toSeq(a) : toSeq(b);
}

/** seq + 1（仅用于构造范围查询的边界，Lamport seq 不连续） */
export function seqPlusOne(value: unknown): string {
    return (BigInt(toSeq(value)) + 1n).toString();
}

/** 转为 BigInt，供 SQLite 以 int64 精确绑定（better-sqlite3 原生支持 bigint 参数） */
export function seqToBigInt(value: unknown): bigint {
    return BigInt(toSeq(value));
}
