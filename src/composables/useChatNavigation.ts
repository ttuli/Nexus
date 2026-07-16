import { useSessionStore } from '@/src/store/session';
import { useMessageStore } from '@/src/store/message';
import { useUserStore } from '@/src/store/user';
import { sessionService } from '@/src/services/sessionService';
import { chatService } from '@/src/services/chatService';
import { getLastContent, isSystemNotificationMessage } from '@/src/utils/messageConverter';
import { useRouter } from 'vue-router';
import { toRaw } from 'vue';

/**
 * 封装切换会话的协调逻辑，避免 sessionStore ↔ messageStore 循环依赖。
 * 在 Vue 组件或 Service 中使用。
 */
export function useChatNavigation() {
    const sessionStore = useSessionStore();
    const messageStore = useMessageStore();
    const userStore = useUserStore();
    const router = useRouter();

    /**
     * 切换当前会话，并触发消息重新加载
     */
    function navigateToChat(sessionKey: string) {
        if (!router.currentRoute.value.path.includes('chat')) {
            router.push('/home/chat');
        }

        const oldSessionKey = sessionStore.currentSessionKey;
        // 离开旧会话前将其消息列表暂存入缓存，供切回时直接恢复
        messageStore.stashCurrentMessages(oldSessionKey);

        if (sessionKey === oldSessionKey) {
            // 再次点击当前会话 → 取消选中
            sessionStore.setCurrentSession('');
            messageStore.resetMessageState();
            return;
        }
        sessionStore.setCurrentSession(sessionKey);

        // 缓存命中直接恢复，未命中才重置并走查库流程
        const restored = messageStore.restoreMessagesFromCache(sessionKey);
        if (!restored) {
            messageStore.resetMessageState();
        }

        const currentSession = sessionStore.currentSession;
        if (currentSession) {
            // 保存未读数被清零等状态到本地 SQLite
            void sessionService.saveMany([{
                ...toRaw(currentSession),
                is_in_list: 1
            } as any]);

            // 初次加载该会话的历史消息
            if (!restored) {
                void loadInitialMessages(sessionKey);
            }
        }
    }

    /**
     * 加载指定会话的第一页历史消息。
     * 优先命中本地 SQLite；未命中时回源到远端 API。
     * 同步更新 messageStore 状态与 sessionStore 摘要字段。
     */
    async function loadInitialMessages(targetSessionKey: string): Promise<void> {
        const messages = await messageStore.loadMore(targetSessionKey, chatService);
        
        if (sessionStore.currentSessionKey !== targetSessionKey) return;

        if (messages && messages.length > 0) {
            const latestMsg = messages[messages.length - 1];
            if (latestMsg) {
                const updatedSession = sessionStore.updateSessionSummary(targetSessionKey, {
                    last_content: getLastContent(latestMsg, userStore.userID, (id) => userStore.getDisplayName(id)),
                    last_message_time: latestMsg.sendTime,
                    // 系统消息无发送者语义，置 0 避免会话预览携带 "xx:" 前缀
                    last_sender: isSystemNotificationMessage(latestMsg.type) ? 0 : latestMsg.fromUserId
                });
                if (updatedSession) {
                    void sessionService.saveMany([toRaw(updatedSession) as any]);
                }
            }
        }
    }

    return { navigateToChat };
}
