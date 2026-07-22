/**
 * 会话级编排动作（模块级纯函数，非 hook）：协调 sessionStore 状态与 chatService I/O。
 * 供 view / composable / listener 共用——listener 无组件上下文，不适合走 hook，
 * 故与 useChatPage 等 hook 型 composable 不同，这里直接导出函数。
 */
import { useSessionStore } from '@/src/store/session';
import { chatService } from '@/src/services/chatService';
import { seqPositive, toSeq } from '@shared/utils/seq';

/**
 * 上报会话已读游标到服务端（read_seq = 本地 max_seq）。
 * 会话无 session_id（服务端尚未建会话）或无任何消息时跳过；
 * 游标单调前进，重复/乱序上报无害。fire-and-forget，失败仅记日志。
 */
export function reportSessionRead(sessionKey: string): void {
    const chat = useSessionStore().getSession(sessionKey);
    if (!chat || !chat.session_id || !seqPositive(chat.max_seq)) return;
    void chatService.reportRead(chat.session_id, toSeq(chat.max_seq));
}

/**
 * 更新会话配置（置顶/免打扰）：本地状态即时生效（乐观）→ 同步服务端。
 * isTop/isDisturb 取值 1/2（2=开启），undefined 表示不变更。
 */
export async function updateSessionOptions(
    sessionKey: string,
    isTop?: number,
    isDisturb?: number,
): Promise<void> {
    const updated = useSessionStore().setSessionOptions(sessionKey, isTop, isDisturb);
    if (!updated) return;
    await chatService.updateSessionOptions(
        // 优先真实雪花 session_id；首次本地会话尚无 id 时置空，服务端按 session_key 解析/创建
        updated.session_id || '',
        sessionKey,
        Number(updated.is_top),
        Number(updated.is_disturb),
    );
}
