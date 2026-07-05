import { useSessionStore } from '@/src/store/session';
import { useMessageStore } from '@/src/store/message';
import { sessionService } from '@/src/services/sessionService';
import { chatService } from '@/src/services/chatService';
import { getLastContent } from '@/src/utils/messageConverter';
import { useRouter } from 'vue-router';

/**
 * 封装切换会话的协调逻辑，避免 conversationStore ↔ messageStore 循环依赖。
 * 在 Vue 组件或 Service 中使用。
 */
export function useChatNavigation() {
    const sessionStore = useSessionStore();
    const messageStore = useMessageStore();
    const router = useRouter();

    /**
     * 切换当前会话，并触发消息重新加载
     */
    function navigateToChat(sessionKey: string) {
        if (!router.currentRoute.value.path.includes('chat')) {
            router.push('/home/chat');
        }

        const oldSessionId = sessionStore.currentSessionKey;

        if (sessionKey === oldSessionId) {
            sessionStore.setCurrentSession('');
        } else {
            sessionStore.setCurrentSession(sessionKey);
        }
        messageStore.resetMessageState();

        const currentSession = sessionStore.currentSession;
        if (currentSession) {
            // 保存未读数被清零等状态到本地 SQLite
            void sessionService.saveMany([{
                ...JSON.parse(JSON.stringify(currentSession)),
                is_in_list: 1
            }]);

            // 初次加载该会话的历史消息
            void loadInitialMessages(sessionKey);
        }
    }

    /**
     * 加载指定会话的第一页历史消息。
     * 优先命中本地 SQLite；未命中时回源到远端 API。
     * 同步更新 messageStore 状态与 sessionStore 摘要字段。
     */
    async function loadInitialMessages(targetSessionKey: string): Promise<void> {
        if (messageStore.isLoading || !messageStore.hasMore) return;

        // 取最旧已确认消息的 seq 作为游标（首次加载列表为空，游标为 undefined）
        const oldestConfirmedSeq = (() => {
            for (const msg of messageStore.messages) {
                const seq = Number(msg.seq);
                if (Number.isFinite(seq) && seq > 0) return seq;
            }
            return undefined;
        })();

        messageStore.isLoading = true;
        try {
            const messages = await chatService.getHistoryMessages(
                targetSessionKey,
                oldestConfirmedSeq,
                messageStore.pageSize
            );

            // 会话已切换，丢弃过期结果
            if (sessionStore.currentSessionKey !== targetSessionKey) return;

            if (messages.length > 0) {
                messageStore.messages.unshift(...messages);

                // 同步更新会话列表摘要
                const cur = sessionStore.sessionList.find((c: any) => c.session_key === targetSessionKey);
                if (cur) {
                    const latestMsg = messageStore.messages[messageStore.messages.length - 1];
                    if (latestMsg) {
                        cur.last_content = getLastContent(latestMsg);
                        cur.last_message_time = latestMsg.sendTime;
                        if (latestMsg.fromUserId) cur.last_sender = latestMsg.fromUserId;
                    }
                }
            }

            if (messages.length < messageStore.pageSize) {
                messageStore.hasMore = false;
            }
        } catch (e) {
            console.error('[useChatNavigation] loadInitialMessages failed:', e);
        } finally {
            if (sessionStore.currentSessionKey === targetSessionKey) {
                messageStore.isLoading = false;
            }
        }
    }

    return { navigateToChat };
}
