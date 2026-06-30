import { defineStore } from 'pinia';
import { useSessionStore } from './session';
import { ImTypes } from '@/src/types';
import { IChatMessage } from '@/src/types/chatMessage';
import { chatService } from '@/src/services';
import { messageStorageService } from '@/src/services/messageStorageService';
import { getLastContent } from '@/src/utils/systemMessage';

export const useMessageStore = defineStore('message', {
    state: () => ({
        messages: [] as IChatMessage[],
        isLoading: false,
        hasMore: true,
        pageSize: 20
    }),
    actions: {
        /**
         * 更新消息状态
         */
        updateMessageStatus(sessionId: string, clientId: string, status: ImTypes.MessageStatus, timestamp: number, msgId?: string, seq?: number) {
            const msgIndex = this.messages.findIndex(m =>
                (sessionId && sessionId === m.sessionId) ||
                (clientId && clientId === m.clientId) ||
                (msgId && msgId === m.msgId)
            );
            if (msgIndex !== -1) {
                const oldSessionId = this.messages[msgIndex].sessionId;
                this.messages[msgIndex].status = status;
                this.messages[msgIndex].sendTime = timestamp;
                if (seq !== undefined && seq > 0) {
                    this.messages[msgIndex].seq = seq;
                }
                if (msgId) {
                    this.messages[msgIndex].msgId = msgId;
                }
                // 如果发现之前的 sessionId 与最新的 sessionId (从服务端返回的真正 conversation_id) 不同，并且最新的 sessionId 有值，我们就更新它！
                if (sessionId && oldSessionId !== sessionId) {
                    console.log(`[MessageStore] Migrating message sessionId in store from ${oldSessionId} to ${sessionId}`);
                    this.messages[msgIndex].sessionId = sessionId;
                    
                    // 并把内存中同属于该旧会话（即本地临时 conv_key）的所有消息的 sessionId 也全部刷新！
                    this.messages.forEach(m => {
                        if (m.sessionId === oldSessionId) {
                            m.sessionId = sessionId;
                        }
                    });
                }
            }
            // 无论是否在内存中，都同步更新本地数据库
            void messageStorageService.updateMessageStatus(sessionId, clientId, status, msgId, seq).catch((e) => {
                console.error('[MessageStore] Failed to persist message status', e);
            });
        },

        /**
         * 更新消息上传进度（图片/文件消息上传时使用）
         * @param clientId 客户端消息ID
         * @param progress 进度 0-100，undefined 表示上传完成
         */
        updateMessageProgress(sessionId: string, clientId: string, progress: number | undefined) {
            const conversationStore = useSessionStore();
            const currentSession = conversationStore.currentSession;
            const matchesSession = currentSession && (
                currentSession.conversation_id === sessionId || 
                currentSession.conv_key === sessionId
            );
            if (matchesSession) {
                const msg = this.messages.find(m => m.clientId === clientId) as any;
                if (msg !== undefined) {
                    msg.uploadProgress = progress;
                }
            }
        },

        /**
         * 更新文件消息的本地路径（下载完成后使用）
         */
        updateFileLocalPath(sessionId: string, clientId: string, msgId: string, localPath: string) {
            const msg = this.messages.find(m =>
                (clientId && m.clientId === clientId) ||
                (msgId && m.msgId === msgId)
            ) as any;
            if (msg) {
                msg.localPath = localPath;
            }
            void messageStorageService.updateMessageLocalPath(sessionId, clientId, msgId, localPath).catch((e) => {
                console.error('[MessageStore] Failed to persist localPath', e);
            });
        },

        /**
         * 加载更多消息
         */
        async loadMoreMessages() {
            const conversationStore = useSessionStore();
            const currentSessionId = conversationStore.currentSessionId;
            const currentSessionKey = conversationStore.currentSessionKey;

            if (this.isLoading || !this.hasMore || !currentSessionId) return;

            // 取列表中最顶端（最旧）的、具有有效 seq 的消息作为游标。
            // 若顶端消息尚无有效 seq（即本地发送中、ACK 未回），说明当前列表
            // 中没有任何已确认的历史消息，无需发起任何请求。
            const oldestConfirmedSeq = (() => {
                for (const msg of this.messages) {
                    const seq = Number(msg.seq);
                    if (Number.isFinite(seq) && seq > 0) return seq;
                }
                return null;
            })();

            if (this.messages.length > 0 && oldestConfirmedSeq === null) {
                // 列表非空，但所有消息都是本地 pending 状态，直接判定无历史可拉
                this.hasMore = false;
                return;
            }

            this.isLoading = true;
            try {
                // beforeSeq 为 null 时表示首次加载（列表为空），传 undefined 给 service
                const moreMessages = await chatService.getHistoryMessages(
                    currentSessionId,
                    oldestConfirmedSeq ?? undefined,
                    this.pageSize
                );

                if (conversationStore.currentSessionKey !== currentSessionKey) {
                    return;
                }

                if (moreMessages.length > 0) {
                    this.messages.unshift(...moreMessages);

                    // 获取消息后更新对应会话的 last_content 等信息
                    const cur = conversationStore.sessionList.find((c: any) => c.conversation_id === currentSessionId);
                    if (cur && this.messages.length > 0) {
                        const latestMsg = this.messages[this.messages.length - 1];
                        if (latestMsg) {
                            cur.last_content = getLastContent(latestMsg);
                            cur.last_message_time = latestMsg.sendTime;
                            if (latestMsg.fromUserId) {
                                cur.last_sender = latestMsg.fromUserId;
                            }
                        }
                    }
                }

                // 返回条数不足一页，则视为没有更多历史
                if (moreMessages.length < this.pageSize) {
                    this.hasMore = false;
                }
            } catch (e) {
                console.error('[MessageStore] Failed to load messages', e);
            } finally {
                if (conversationStore.currentSessionKey === currentSessionKey) {
                    this.isLoading = false;
                }
            }
        },

        /**
         * 重置当前会话消息状态
         */
        resetMessageState() {
            this.messages = [];
            this.isLoading = false;
            this.hasMore = true;
        },

        /**
         * 添加消息
         */
        addMessage(message: IChatMessage) {
            // Deduplicate
            if (this.messages.some(m => (message.msgId !== '' && m.msgId === message.msgId) || (message.clientId && m.clientId === message.clientId))) {
                return this.updateMessageStatus(message.sessionId, message.clientId || '', message.status, message.sendTime);
            }
            
            const conversationStore = useSessionStore();
            
            // Check if message belongs to current session
            const currentSession = conversationStore.currentSession;
            const belongsToCurrent = currentSession && (
                currentSession.conversation_id === message.sessionId ||
                currentSession.conv_key === message.sessionId
            );
            if (belongsToCurrent) {
                this.messages.push(message);
            }

            // Generate last content string based on message type
            const lastContent = getLastContent(message);

            const chat = conversationStore.getSession(message.sessionId);
            if (chat) {
                chat.max_seq = message.seq;
            }
            
            const isGroupMessage = [
                ImTypes.MessageType.GROUP_TEXT,
                ImTypes.MessageType.GROUP_IMAGE,
                ImTypes.MessageType.GROUP_VIDEO,
                ImTypes.MessageType.GROUP_FILE,
                ImTypes.MessageType.GROUP_AUDIO,
                ImTypes.MessageType.GROUP_OP_NOTIFICATION
            ].includes(message.type);
            const conversationType = isGroupMessage ? ImTypes.ConversationType.CONVERSATION_TYPE_GROUP : ImTypes.ConversationType.CONVERSATION_TYPE_PRIVATE;

            const conversationId = (message.sessionId !== message.sessionKey) ? message.sessionId : (chat?.conversation_id || '');
            const sessionKey = message.sessionKey || chat?.conv_key || message.sessionId;

            conversationStore.upsertSession({
                conversation_id: conversationId,
                conv_key: sessionKey,
                type: conversationType,
                max_seq: message.seq,
                last_content: lastContent,
                last_sender: message.fromUserId,
                update_time: message.sendTime,
            });
            conversationStore.sortSessionList();

            void messageStorageService.saveMessage(message).catch((e) => {
                console.error('[MessageStore] Failed to persist message', e);
            });
        }
    }
});
