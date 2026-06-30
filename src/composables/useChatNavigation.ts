import { useSessionStore } from '@/src/store/session';
import { useMessageStore } from '@/src/store/message';
import { ImTypes } from '@/src/types';
import { ElMessage } from 'element-plus';

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
    function navigateToChat(sessionKey: string, explicitType?: ImTypes.ConversationType) {
        const oldSessionId = conversationStore.currentSessionKey;

        conversationStore.setCurrentSession(sessionKey, explicitType);

        if (sessionKey !== oldSessionId) {
            messageStore.resetMessageState();
        }

        const currentSession = conversationStore.currentSession;
        if (currentSession) {
            // 确保解析出 conversation_id（如果没有会去本地/服务端拉取）
            conversationStore.resolveCurrentConversationId().then(() => {
                // 确保仍处于该会话
                if (conversationStore.currentSessionKey === currentSession.conv_key) {
                    if (messageStore.messages.length === 0 && messageStore.hasMore) {
                        messageStore.loadMoreMessages();
                    }
                }
            }).catch((e) => {
                console.error('[useChatNavigation] Failed to resolve conversation ID:', e);
                ElMessage.error("获取会话失败");
            });
        }
    }

    return { navigateToChat };
}
