/**
 * 会话级编排动作（模块级纯函数，非 hook）：协调 sessionStore 状态与 chatService I/O。
 * 供 view / composable / listener 共用——listener 无组件上下文，不适合走 hook，
 * 故与 useChatPage 等 hook 型 composable 不同，这里直接导出函数。
 */
import { useSessionStore } from '@/src/store/session';
import { useMessageStore } from '@/src/store/message';
import { chatService } from '@/src/services/chatService';
import { messageService } from '@/src/services';
import { seqPositive, toSeq } from '@shared/utils/seq';
import CusDialog from '@/src/components/CusDialog';
import { DialogResult } from '@/src/components/CusDialog/types';
import { ElMessage } from 'element-plus';

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

/**
 * 清除指定会话的本地聊天记录（含弹窗确认与结果提示）。
 * 包含：二次确认、内存消息与缓存清理、清空 DB 中的消息、重置会话最新消息显示。
 *
 * @param sessionKey 会话 session_key
 * @param onSuccess 成功清除后的回调函数（可选，如关闭弹窗/侧栏）
 * @returns 是否确认并完成了清除
 */
export async function clearSessionMessages(
    sessionKey: string,
    onSuccess?: () => void,
): Promise<boolean> {
    const res = await CusDialog.open({
        title: '提示',
        content: '确定要清除本地的聊天记录吗？这不会影响其他设备的数据。',
        showCancel: true,
        confirmText: '确定',
        cancelText: '取消',
    });

    if (res !== DialogResult.Confirm) return false;

    const sessionStore = useSessionStore();
    const messageStore = useMessageStore();

    // 1. 清理内存消息缓存和当前消息列表
    messageStore.clearSessionMessage(sessionKey);

    const session = sessionStore.getSession(sessionKey);
    if (session) {
        // 2. 清除数据库中的消息记录
        if (session.session_id) {
            await messageService.clearMessagesBySessionId(session.session_id || session.session_key);
        }

        // 3. 重置会话在列表中的最后一条消息显示
        session.last_content = '';
        session.unread_count = 0;
        session.last_sender = 0;
        session.last_message_time = 0;
    }

    ElMessage.success('聊天记录已清除');
    onSuccess?.();
    return true;
}


