import { defineStore } from 'pinia';
import { useUserStore } from './user';
import { ImTypes } from '@/types';
import { IChatMessage } from '@/types/chatMessage';
import { chatService } from '@/services';
import { config } from '@/config';

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
         * 添加或置顶聊天
         * 如果已存在则移到第一位，如果不存在则添加到第一位
         */
        addChat(sessionId: string) {
            let type: ImTypes.ConversationType;
            let targetId: number;

            if (sessionId.startsWith('group_')) {
                type = ImTypes.ConversationType.CONVERSATION_TYPE_GROUP;
                targetId = parseInt(sessionId.split('_')[1], 10);
            } else {
                type = ImTypes.ConversationType.CONVERSATION_TYPE_PRIVATE;
                const parts = sessionId.split('_');
                const uid1 = parseInt(parts[1], 10);
                const uid2 = parseInt(parts[2], 10);
                const myId = useUserStore().getUserID();
                targetId = (uid1 === myId) ? uid2 : uid1;
            }

            const existingIndex = this.chatList.findIndex(
                (c) => c.conversation_id === sessionId
            );

            if (existingIndex !== -1) {
                // 已存在，移到第一位
                const [existing] = this.chatList.splice(existingIndex, 1);
                this.chatList.unshift(existing);
            } else {
                // 不存在，添加新聊天
                const newChat: ImTypes.Conversation = {
                    target_id: targetId,
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
            this.currentChatId = currentChat?.target_id ?? null;
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

                // 移到第一位
                const index = this.chatList.indexOf(chat);
                if (index > 0) {
                    this.chatList.splice(index, 1);
                    this.chatList.unshift(chat);
                }
            }
        },

        /**
         * 更新消息状态
         */
        updateMessageStatus(sessionId: string, clientId: string, status: ImTypes.MessageStatus) {
            const msgIndex = this.messages.findIndex(m => m.sessionId === sessionId && m.clientId === clientId);
            if (msgIndex !== -1) {
                this.messages[msgIndex].status = status;
                void chatService.updateMessageStatus(sessionId, clientId, status).catch((e) => {
                    console.error('[ChatStore] Failed to persist message status', e);
                });
            } else {

            }
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
        removeChat(id: number, type: ImTypes.ConversationType) {
            const index = this.chatList.findIndex((c) => c.target_id === id && c.type === type);
            if (index !== -1) {
                this.chatList.splice(index, 1);
            }
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
                        // target_id should already be number in JSON
                        type: c.type || ImTypes.ConversationType.CONVERSATION_TYPE_PRIVATE, // Assuming fallback
                        last_message_time: c.last_message_time || 0,
                        unread_count: c.unread_count || 0,
                        create_time: c.create_time || 0,
                        update_time: c.update_time || 0,
                    }));
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
                return this.updateMessageStatus(message.sessionId, message.clientId || '', message.status);
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
            } else {
                lastContent = '[消息]';
            }

            this.updateLastMessage(message.sessionId, lastContent);
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
    },
});
