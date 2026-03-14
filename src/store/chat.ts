import { defineStore } from 'pinia';
import { useUserStore } from './user';
import { ApiTypes, ImTypes } from '@/types';
import { IChatMessage, ILocalSystemMessage } from '@/types/chatMessage';
import { chatService, windowService } from '@/services';
import { updateConversation } from '@/apis/message';
import { config } from '@/config';
import { extractTargetIdFromSessionId, formatSystemMessage } from '@/utils/chat';

export const useChatStore = defineStore('chat', {
    state: () => ({
        chatList: [] as ImTypes.Conversation[],
        currentChatId: null as number | null,
        currentChatType: null as ImTypes.ConversationType | null, // 使用 proto enum
        currentSessionId: '',
        messages: [] as IChatMessage[],
        isLoading: false,
        hasMore: true,
        pageSize: 20
    }),
    actions: {
        /**
         * 根据服务端会话数据更新聊天列表
         * 已存在：更新 max_seq / update_time，累加未读增量
         * 不存在：新建条目，未读数 = max_seq（本地无基线）
         */
        upsertConversation(conversation: Omit<ApiTypes.message.Conversation, 'create_time' | 'conversation_type'> & Partial<Pick<ApiTypes.message.Conversation, 'create_time' | 'conversation_type'>>) {
            this.addChat(conversation.conversation_id)
            const existing = this.chatList.find(
                c => c.conversation_id === conversation.conversation_id
            );

            if (existing) {
                const delta = Math.max(0, conversation.max_seq - existing.max_seq);
                if (delta > 0) {
                    windowService.playNotificationSound()
                }
                existing.unread_count = (existing.unread_count || 0) + delta;
                existing.max_seq = conversation.max_seq;
                existing.update_time = conversation.update_time;
                existing.last_content = conversation.last_content;
                existing.last_message_time = conversation.update_time;
                existing.last_sender = conversation.last_sender;
            }
        },

        /**
         * 添加或置顶聊天
         * 如果已存在则移到第一位，如果不存在则添加到第一位
         */
        addChat(sessionId: string) {
            let type: ImTypes.ConversationType;

            if (sessionId.startsWith('group_')) {
                type = ImTypes.ConversationType.CONVERSATION_TYPE_GROUP;
            } else {
                type = ImTypes.ConversationType.CONVERSATION_TYPE_PRIVATE;
            }

            const existingIndex = this.chatList.findIndex(
                (c) => c.conversation_id === sessionId
            );

            if (existingIndex !== -1) {
                // 已存在，什么都不做，可能需要更新时间
                // 这里只处理添加逻辑，如果要有最新行为请通过 updateLastMessage 处理
            } else {
                // 不存在，添加新聊天
                const newChat: ImTypes.Conversation = {
                    max_seq: 0,
                    last_sender: 0,
                    type,
                    conversation_id: sessionId,
                    last_content: '',
                    last_message_time: Date.now(),
                    unread_count: 0,
                    create_time: Date.now(),
                    update_time: Date.now(),
                    is_top: false,
                    is_disturb: false,
                    last_msg_type: ImTypes.MessageType.UNKNOWN,
                };
                this.chatList.unshift(newChat);
                this.sortChatList();

                // 超过最大数量时，移除最后一个
                if (this.chatList.length > config.maxChatListCount) {
                    this.chatList.pop();
                }
            }
        },

        /**
         * 设置当前聊天
         */
        setCurrentChat(sessionId: string) {
            // 如果不存在则添加
            if (!this.chatList.find((c) => c.conversation_id === sessionId)) {
                this.addChat(sessionId);
            }

            const currentChat = this.chatList.find((c) => c.conversation_id === sessionId) || null;
            if (!currentChat) {
                this.currentChatId = null;
            } else {
                const userStore = useUserStore();
                this.currentChatId = extractTargetIdFromSessionId(sessionId, userStore.getUserID());
            }
            this.currentChatType = currentChat?.type ?? null;

            const oldSessionId = this.currentSessionId;
            this.currentSessionId = sessionId;
            this.clearUnread(this.currentSessionId);
            // Reset and load initial messages if the session has changed
            if (this.currentSessionId !== oldSessionId) {
                this.resetMessageState();
                this.loadMoreMessages();
            } else if (this.messages.length === 0) {
                this.loadMoreMessages();
            }
        },

        /**
         * 清除未读数
         */
        clearUnread(sessionId: string) {
            const chat = this.chatList.find((c) => c.conversation_id === sessionId);
            if (chat) {
                chat.unread_count = 0;
            }
        },

        /**
         * 更新最后一条消息
         */
        updateLastMessage(sessionId: string, message: string) {
            let chat = this.chatList.find((c) => c.conversation_id === sessionId);

            if (!chat) {
                // 自动添加新会话
                this.addChat(sessionId);
                chat = this.chatList.find((c) => c.conversation_id === sessionId);
            }

            if (chat) {
                chat.last_content = message;
                chat.last_message_time = Date.now();
                chat.update_time = Date.now();

                // 重新排序
                this.sortChatList();
            }
        },

        /**
         * 更新消息状态
         */
        updateMessageStatus(sessionId: string, clientId: string, status: ImTypes.MessageStatus, timestamp: number, msgId?: string) {
            const msgIndex = this.messages.findIndex(m =>
                m.sessionId === sessionId &&
                ((clientId && m.clientId === clientId) || (msgId && m.msgId === msgId))
            );
            if (msgIndex !== -1) {
                this.messages[msgIndex].status = status;
                this.messages[msgIndex].sendTime = timestamp;
            }
            // 无论是否在内存中，都同步更新本地数据库
            void chatService.updateMessageStatus(sessionId, clientId, status, msgId).catch((e) => {
                console.error('[ChatStore] Failed to persist message status', e);
            });
        },

        /**
         * 更新消息上传进度（图片/文件消息上传时使用）
         * @param clientId 客户端消息ID
         * @param progress 进度 0-100，undefined 表示上传完成
         */
        updateMessageProgress(clientId: string, progress: number | undefined) {
            const msg = this.messages.find(m => m.clientId === clientId) as any;
            if (msg !== undefined) {
                msg.uploadProgress = progress;
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
            void chatService.updateMessageLocalPath(sessionId, clientId, msgId, localPath).catch((e) => {
                console.error('[ChatStore] Failed to persist localPath', e);
            });
        },

        /**
         * 增加未读数
         */
        incrementUnread(sessionId: string) {
            const chat = this.chatList.find((c) => c.conversation_id === sessionId);
            if (chat) {
                const count = chat.unread_count || 0;
                chat.unread_count = count + 1;
            }
        },

        /**
         * 移除聊天
         */
        removeChat(sessionId: string) {
            const index = this.chatList.findIndex((c) => c.conversation_id === sessionId);
            if (index !== -1) {
                this.chatList.splice(index, 1);
            }
        },

        /**
         * 设置置顶状态
         */
        async setTopStatus(sessionId: string, isTop: boolean) {
            const chat = this.chatList.find((c) => c.conversation_id === sessionId);
            if (!chat) return;

            // 乐观更新本地状态
            const oldStatus = chat.is_top;
            chat.is_top = isTop;
            
            // 重新排序，将置顶的放到前面，按时间倒序
            this.sortChatList();

            try {
                // 异步更新到服务器
                await updateConversation({
                    conversation_id: sessionId,
                    is_top: isTop ? 1 : 0
                } as ApiTypes.message.UpdateConversationReq);
            } catch (error) {
                // 如果失败则回滚
                console.error('[ChatStore] Failed to update top status', error);
                chat.is_top = oldStatus;
                this.sortChatList();
            }
        },

        /**
         * 对聊天列表排序 (置顶在前, 然后按最近消息时间排序)
         */
        sortChatList() {
            this.chatList.sort((a, b) => {
                if (a.is_top !== b.is_top) {
                    return a.is_top ? -1 : 1;
                }
                const timeA = a.last_message_time || a.update_time || 0;
                const timeB = b.last_message_time || b.update_time || 0;
                return timeB - timeA;
            });
        },

        /**
         * 从 localStorage 加载聊天列表
         * @param userId 用户 ID
         */
        loadFromStorage(userId: number) {
            const key = `im-chat-store-${userId}`;
            const saved = localStorage.getItem(key);
            if (saved) {
                try {
                    const data = JSON.parse(saved);
                    // 恢复时需要注意类型
                    this.chatList = (data.chatList || []).map((c: any) => ({
                        ...c,
                        type: c.type || ImTypes.ConversationType.CONVERSATION_TYPE_PRIVATE, // Assuming fallback
                        last_message_time: c.last_message_time || 0,
                        unread_count: c.unread_count || 0,
                        create_time: c.create_time || 0,
                        update_time: c.update_time || 0,
                        is_top: c.is_top || false,
                        is_disturb: c.is_disturb || false,
                    }));
                    this.sortChatList();
                } catch (e) {
                    console.error('[ChatStore] Failed to load from storage:', e);
                }
            }
        },

        /**
         * 保存聊天列表到 localStorage
         * @param userId 用户 ID
         */
        saveToStorage(userId: number) {
            const key = `im-chat-store-${userId}`;
            // No custom replacer needed for number
            localStorage.setItem(key, JSON.stringify({
                chatList: this.chatList,
            }));
        },

        /**
         * 清除持久化数据
         * @param userId 用户 ID
         */
        clearStorage(userId: number) {
            const key = `im-chat-store-${userId}`;
            localStorage.removeItem(key);
        },

        /**
         * 加载更多消息
         */
        async loadMoreMessages() {
            if (this.isLoading || !this.hasMore || !this.currentSessionId) return;

            this.isLoading = true;
            try {
                // Fetch from service
                // Use the oldest message's sendTime as local cursor.
                // Also pass seq cursor when available; if seq is missing,
                // service will fallback to server history API.
                let cursor: string | number | undefined = undefined;
                let cursorSeq: number | undefined = undefined;
                if (this.messages.length > 0) {
                    cursor = this.messages[0].sendTime;
                    const oldestSeq = Number(this.messages[0].seq);
                    if (Number.isFinite(oldestSeq) && oldestSeq > 0) {
                        cursorSeq = oldestSeq;
                    } else {
                        const knownSeqs = this.messages
                            .map(m => Number(m.seq))
                            .filter((seq) => Number.isFinite(seq) && seq > 0);
                        if (knownSeqs.length > 0) {
                            cursorSeq = Math.min(...knownSeqs);
                        } else {
                            const cur = this.chatList.find(c => c.conversation_id === this.currentSessionId);
                            if (cur && (cur.max_seq ?? 0) > 0) {
                                cursorSeq = cur.max_seq;
                            }
                        }
                    }
                }

                const moreMessages = await chatService.getHistoryMessages(this.currentSessionId, cursor, this.pageSize, cursorSeq);

                if (moreMessages.length > 0) {
                    this.messages.unshift(...moreMessages);
                }

                // If fewer messages returned than requested, assume no more history
                if (moreMessages.length < this.pageSize) {
                    this.hasMore = false;
                }
            } catch (e) {
                console.error('Failed to load messages', e);
            } finally {
                this.isLoading = false;
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
            // Check if message belongs to current session
            if (this.currentSessionId && message.sessionId === this.currentSessionId) {
                this.messages.push(message);
            }

            // Generate last content string based on message type
            let lastContent = '';
            if (message.type === ImTypes.MessageType.CHAT_TEXT || message.type === ImTypes.MessageType.GROUP_TEXT) {
                lastContent = (message as any).content;
            } else if (message.type === ImTypes.MessageType.CHAT_IMAGE || message.type === ImTypes.MessageType.GROUP_IMAGE) {
                lastContent = '[图片]';
            } else if (message.type === ImTypes.MessageType.CHAT_FILE || message.type === ImTypes.MessageType.GROUP_FILE) {
                lastContent = '[文件]';
            } else if (message.type === ImTypes.MessageType.CHAT_VIDEO || message.type === ImTypes.MessageType.GROUP_VIDEO) {
                lastContent = '[视频]';
            } else if (message.type === ImTypes.MessageType.CHAT_AUDIO || message.type === ImTypes.MessageType.GROUP_AUDIO) {
                lastContent = '[音频]';
            } else if (
                message.type === ImTypes.MessageType.GROUP_OP_NOTIFICATION ||
                message.type === ImTypes.MessageType.MSG_RECALL
            ) {
                lastContent = formatSystemMessage(message as ILocalSystemMessage);
            } else {
                lastContent = '[消息]';
            }

            this.chatList.forEach(chat => {
                if (chat.conversation_id === message.sessionId) {
                    chat.max_seq = message.seq;
                }
            })
            this.upsertConversation({
                conversation_id: message.sessionId,
                max_seq: message.seq,
                last_content: lastContent,
                last_sender: message.fromUserId,
                update_time: message.sendTime,
            });
            this.sortChatList();

            void chatService.saveMessage(message).catch((e) => {
                console.error('[ChatStore] Failed to persist message', e);
            });
        },
    },
    getters: {
        /**
         * 获取当前聊天
         */
        currentChat: (state) => {
            if (!state.currentSessionId) {
                return null;
            }
            return state.chatList.find(
                (c) => c.conversation_id === state.currentSessionId
            ) || null;
        },
        /**
         * 获取所有聊天的未读消息总数
         */
        totalUnreadCount: (state) => {
            return state.chatList.reduce((acc, current) => {
                return acc + (current.unread_count || 0);
            }, 0);
        }
    },
});
