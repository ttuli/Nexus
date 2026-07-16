import { ref, toRaw } from 'vue';
import { useSessionStore } from '@/src/store/session';
import { useMessageStore } from '@/src/store/message';
import { useUserStore } from '@/src/store/user';
import type { IMessageSender, IMessagePersister, IFileUploader, IHistoryFetcher } from '@/src/store/message';
import { getLastContent, isSystemNotificationMessage } from '@/src/utils/messageConverter';

// ─── Service Imports（仅在 Composable 层引入，注入进 Store）────────────────────
import { chatService } from '@/src/services/chatService';
import { websocketService } from '@/src/services/websocketService';
import { fileService } from '@/src/services/fileService';
import { messageService } from '@/src/services/messageService';
import { sessionService } from '@/src/services/sessionService';

// ─── 模块级 DI 适配器（只创建一次，避免每次调用时重复构建）─────────────────────

const sender: IMessageSender = websocketService;

const persister: IMessagePersister = {
    save: (msg) => messageService.saveMessage(msg),
};

const uploader: IFileUploader = fileService;

const fetcher: IHistoryFetcher = chatService;

// ─────────────────────────────────────────────────────────────────────────────

export function useChatPage() {
    const sessionStore = useSessionStore();
    const messageStore = useMessageStore();
    const userStore = useUserStore();
    const inputText = ref('');
    const isSending = ref(false);

    /**
     * 发送文本消息并更新会话摘要
     */
    async function sendTextMessage(content?: string) {
        const text = (content !== undefined ? content : inputText.value).trim();
        if (!text) return;

        isSending.value = true;
        try {
            const currentKey = sessionStore.currentSessionKey;
            const sentMsg = await messageStore.sendTextMessage(text, { sender, persister });

            // 跨 Store 编排：更新会话列表摘要
            const updatedSession = sessionStore.updateSessionSummary(currentKey, {
                last_content: getLastContent(sentMsg),
                last_message_time: sentMsg.sendTime || Date.now(),
                last_sender: sentMsg.fromUserId
            });
            if (updatedSession) {
                void sessionService.saveMany([toRaw(updatedSession)]);
            }
            if (content === undefined) {
                inputText.value = '';
            }
        } catch (e) {
            console.error('[useChatPage] sendTextMessage failed:', e);
        } finally {
            isSending.value = false;
        }
    }

    /**
     * 发送图片消息并更新会话摘要
     */
    async function sendImageMessage(file: File) {
        try {
            const currentKey = sessionStore.currentSessionKey;
            const sentMsg = await messageStore.sendImageMessage(file, { uploader, sender, persister });

            if (sentMsg) {
                const updatedSession = sessionStore.updateSessionSummary(currentKey, {
                    last_content: getLastContent(sentMsg),
                    last_message_time: sentMsg.sendTime || Date.now(),
                    last_sender: sentMsg.fromUserId
                });
                if (updatedSession) {
                    void sessionService.saveMany([toRaw(updatedSession)]);
                }
            }
        } catch (e) {
            console.error('[useChatPage] sendImageMessage failed:', e);
        }
    }

    /**
     * 发送文件消息并更新会话摘要
     */
    async function sendFileMessage(file: File) {
        try {
            const currentKey = sessionStore.currentSessionKey;
            const sentMsg = await messageStore.sendFileMessage(file, { uploader, sender, persister });

            if (sentMsg) {
                const updatedSession = sessionStore.updateSessionSummary(currentKey, {
                    last_content: getLastContent(sentMsg),
                    last_message_time: sentMsg.sendTime || Date.now(),
                    last_sender: sentMsg.fromUserId
                });
                if (updatedSession) {
                    void sessionService.saveMany([toRaw(updatedSession)]);
                }
            }
        } catch (e) {
            console.error('[useChatPage] sendFileMessage failed:', e);
        }
    }

    /**
     * 发送视频消息并更新会话摘要
     */
    async function sendVideoMessage(file: File) {
        try {
            const currentKey = sessionStore.currentSessionKey;
            const sentMsg = await messageStore.sendVideoMessage(file, { uploader, sender, persister });

            if (sentMsg) {
                const updatedSession = sessionStore.updateSessionSummary(currentKey, {
                    last_content: getLastContent(sentMsg),
                    last_message_time: sentMsg.sendTime || Date.now(),
                    last_sender: sentMsg.fromUserId
                });
                if (updatedSession) {
                    void sessionService.saveMany([toRaw(updatedSession)]);
                }
            }
        } catch (e) {
            console.error('[useChatPage] sendVideoMessage failed:', e);
        }
    }

    /**
     * 加载更多历史消息，并同步更新会话列表摘要
     */
    async function loadMore() {
        const sessionKey = sessionStore.currentSessionKey;
        if (!sessionKey) return;

        // 将 chatService 作为 fetcher 注入
        const loadedMessages = await messageStore.loadMore(sessionKey, fetcher);

        if (loadedMessages && loadedMessages.length > 0) {
            const latestMsg = loadedMessages[loadedMessages.length - 1];
            if (latestMsg) {
                const updatedSession = sessionStore.updateSessionSummary(sessionKey, {
                    last_content: getLastContent(latestMsg, userStore.userID, (id) => userStore.getDisplayName(id)),
                    last_message_time: latestMsg.sendTime,
                    // 系统消息无发送者语义，置 0 避免会话预览携带 "xx:" 前缀
                    last_sender: isSystemNotificationMessage(latestMsg.type) ? 0 : latestMsg.fromUserId
                });
                if (updatedSession) {
                    void sessionService.saveMany([toRaw(updatedSession)]);
                }
            }
        }
    }

    return {
        inputText,
        isSending,
        sendTextMessage,
        sendImageMessage,
        sendFileMessage,
        sendVideoMessage,
        loadMore
    };
}
