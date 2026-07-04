import { useSessionStore } from '@/src/store/session';
import { useMessageStore } from '@/src/store/message';

/**
 * 封装切换会话的协调逻辑，避免 conversationStore ↔ messageStore 循环依赖。
 * 在 Vue 组件或 Service 中使用。
 */
export function useChatNavigation() {
    const conversationStore = useSessionStore();
    const messageStore = useMessageStore();

    /**
     * 切换当前会话，并触发消息重新加载
     */
    function navigateToChat(sessionKey: string) {
        const oldSessionId = conversationStore.currentSessionKey;

        conversationStore.setCurrentSession(sessionKey);

        if (sessionKey !== oldSessionId) {
            messageStore.resetMessageState();
        }

        const currentSession = conversationStore.currentSession;
        if (currentSession) {
            if (messageStore.messages.length === 0 && messageStore.hasMore) {
                messageStore.loadMoreMessages();
            }
        }
    }

    return { navigateToChat };
}
