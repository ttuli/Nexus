import { defineStore } from 'pinia';
import { ImTypes, IpcChannels } from '@/src/types';
import { windowService } from '@/src/services';
import { Renderer_Config as config } from '@/src/config/constants';
import { judgeSessionType } from '@/src/utils/sessionUtils';
import { getConversation } from '@/src/apis/message';

export const useSessionStore = defineStore('conversation', {
    state: () => ({
        sessionList: [] as ImTypes.Session[],
        currentSessionKey: '', // 唯一的本地 conv_key
    }),
    actions: {
        /**
         * 根据服务端会话数据更新聊天列表
         * 已存在：更新 max_seq / update_time，并回填 conversation_id（如果有的话）
         * 不存在：新建条目，并加入侧边栏列表 (is_in_list = 1)
         */
        upsertSession(conversation: {
            conversation_id: string;
            conversation_type?: number;
            type?: ImTypes.SessionType;
            conv_key?: string;
            max_seq: number;
            update_time: number;
            last_content: string;
            last_sender: number;
            unread_count?: number;
            create_time?: number;
            is_top?: number;
            is_disturb?: number;
        }) {
            const conversationId = conversation.conversation_id;
            const sessionKey = conversation.conv_key || conversationId;
            const type = conversation.type !== undefined
                ? conversation.type
                : (conversation.conversation_type !== undefined
                    ? (conversation.conversation_type as ImTypes.SessionType)
                    : ImTypes.SessionType.SESSION_TYPE_PRIVATE);

            // 优先通过 conversation_id，其次通过 conv_key 检索本地已存在的会话
            let existing = this.sessionList.find(
                c => (conversationId && c.conversation_id === conversationId) ||
                    (sessionKey && c.conv_key === sessionKey)
            );

            if (existing) {
                // 如果存在，回填缺少的 ID
                if (conversationId && !existing.conversation_id) {
                    existing.conversation_id = conversationId;
                }
                if (sessionKey && !existing.conv_key) {
                    existing.conv_key = sessionKey;
                }

                const delta = Math.max(0, conversation.max_seq - (existing.max_seq || 0));
                if (delta > 0) {
                    windowService.playNotificationSound();
                }
                existing.unread_count = (existing.unread_count || 0) + delta;
                existing.max_seq = conversation.max_seq;
                existing.update_time = conversation.update_time;
                existing.last_content = conversation.last_content;
                existing.last_message_time = conversation.update_time;
            } else {
                // 不存在，新建会话
                const newChat: ImTypes.Conversation & { is_in_list?: number } = {
                    conversation_id: conversationId,
                    conv_key: sessionKey,
                    type,
                    max_seq: conversation.max_seq || 0,
                    last_sender: conversation.last_sender || 0,
                    last_content: conversation.last_content || '',
                    last_message_time: conversation.update_time || Date.now(),
                    unread_count: conversation.unread_count || 0,
                    create_time: conversation.create_time || Date.now(),
                    update_time: conversation.update_time || Date.now(),
                    is_top: conversation.is_top || 1,
                    is_disturb: conversation.is_disturb || 1,
                    is_in_list: 1, // 服务端推送的活动会话默认加入列表
                };
                this.sessionList.unshift(newChat);
                this.sortSessionList();

                // 超过最大数量时，移除最后一个
                if (this.sessionList.length > config.maxSessionListCount) {
                    this.sessionList.pop();
                }
            }
            void this.saveToStorage();
        },

        /**
         * 添加或置顶聊天
         * 如果已存在则移到第一位，如果不存在则添加到第一位
         */
        addOrPinToTop(sessionKey: string) {
            const type = judgeSessionType(sessionKey)

            const existing = this.getSession(sessionKey);

            if (existing) {
                // 已存在，确保其在活跃列表中且置顶/移至头部
                const existingIndex = this.sessionList.findIndex(c => c === existing);
                if (existingIndex !== -1) {
                    const [item] = this.sessionList.splice(existingIndex, 1);
                    this.sessionList.unshift(item);
                }
                void this.saveToStorage();
            } else {
                // 添加新聊天
                const newChat: ImTypes.Session & { is_in_list?: number } = {
                    max_seq: 0,
                    last_sender: 0,
                    type,
                    session_id: '',
                    session_key: sessionKey,
                    last_content: '',
                    last_message_time: Date.now(),
                    unread_count: 0,
                    create_time: Date.now(),
                    update_time: Date.now(),
                    is_top: 1,
                    is_disturb: 1,
                    is_in_list: 1, // 新添加的聊天默认在列表中
                };
                this.sessionList.unshift(newChat);
                this.sortSessionList();

                // 超过最大数量时，移除最后一个
                if (this.sessionList.length > config.maxSessionListCount) {
                    this.sessionList.pop();
                }
                void this.saveToStorage();
            }
        },

        setCurrentSession(sessionkey: string) {
            // 如果不存在则添加
            let currentSession = this.getSession(sessionkey);
            if (!currentSession) {
                this.addOrPinToTop(sessionkey);
                currentSession = this.getSession(sessionkey);
            }

            if (!currentSession) {
                this.currentSessionKey = '';
            } else {
                this.currentSessionKey = sessionkey;
                this.clearUnread(sessionkey);
            }
        },

        /**
         * 清除未读数
         */
        clearUnread(sessionkey: string) {
            const chat = this.getSession(sessionkey);
            if (chat) {
                chat.unread_count = 0;
                void this.saveToStorage();
            }
        },

        /**
         * 增加未读数
         */
        incrementUnread(sessionkey: string) {
            const chat = this.getSession(sessionkey);
            if (chat) {
                const count = chat.unread_count || 0;
                chat.unread_count = count + 1;
                void this.saveToStorage();
            }
        },

        /**
         * 移除聊天
         */
        removeSession(sessionkey: string) {
            const index = this.sessionList.findIndex((c) => c.session_key === sessionkey);
            if (index !== -1) {
                this.sessionList.splice(index, 1);
            }
            void window.ipcRenderer.invoke(IpcChannels.CONVERSATION_DELETE, sessionkey).catch((e) => {
                console.error('[ConversationStore] Failed to delete conversation in SQLite:', e);
            });
        },

        /**
         * 对聊天列表排序 (置顶在前, 然后按最近消息时间排序)
         */
        sortSessionList() {
            this.sessionList.sort((a, b) => {
                if (a.is_top !== b.is_top) {
                    return a.is_top === 2 ? -1 : 1;
                }
                const timeA = a.last_message_time || a.update_time || 0;
                const timeB = b.last_message_time || b.update_time || 0;
                return timeB - timeA;
            });
        },

        /**
         * 从 SQLite 加载聊天列表
         */
        async loadFromStorage(): Promise<void> {
            try {
                console.log('[ConversationStore] Loading from SQLite');
                const res = await window.ipcRenderer.invoke(IpcChannels.CONVERSATION_GET_LIST);
                if (res.success && Array.isArray(res.data)) {
                    // 仅加载 is_in_list === 1 的活跃聊天列表
                    this.sessionList = res.data
                        .filter((c: any) => c.is_in_list === 1)
                        .map((c: any) => ({
                            ...c,
                            type: c.type || ImTypes.SessionType.SESSION_TYPE_PRIVATE,
                            session_key: c.conv_key || c.session_key || '',
                            last_message_time: c.last_message_time || 0,
                            unread_count: c.unread_count || 0,
                            create_time: c.create_time || 0,
                            update_time: c.update_time || 0,
                            is_top: Number(c.is_top) || 1,
                            is_disturb: Number(c.is_disturb) || 1,
                        }));
                    this.sortSessionList();
                } else {
                    console.error('[ConversationStore] Failed to load conversations from SQLite:', res.error);
                }
            } catch (e) {
                console.error('[ConversationStore] Failed to load from SQLite:', e);
            }
        },

        /**
         * 从 SQLite 加载单个会话
         */
        async loadSessionFromStorage(keyOrId: string): Promise<ImTypes.Conversation | null> {
            try {
                const res = await window.ipcRenderer.invoke(IpcChannels.CONVERSATION_GET, keyOrId);
                if (res.success && res.data) {
                    return {
                        ...res.data,
                        type: res.data.type || ImTypes.SessionType.CONVERSATION_TYPE_PRIVATE,
                        conv_key: res.data.conv_key || res.data.conversation_id || '',
                        last_message_time: res.data.last_message_time || 0,
                        unread_count: res.data.unread_count || 0,
                        create_time: res.data.create_time || 0,
                        update_time: res.data.update_time || 0,
                        is_top: Number(res.data.is_top) || 1,
                        is_disturb: Number(res.data.is_disturb) || 1,
                    };
                }
            } catch (e) {
                console.error('[ConversationStore] Failed to load chat from SQLite:', e);
            }
            return null;
        },

        /**
         * 保存聊天列表到 SQLite
         */
        async saveToStorage(): Promise<void> {
            try {
                console.log('[ConversationStore] Saving to SQLite');
                // 确保 sessionList 中所有项目的 is_in_list 均为 1
                const sessionListRaw = this.sessionList.map((c) => ({
                    ...JSON.parse(JSON.stringify(c)),
                    is_in_list: 1
                }));
                const res = await window.ipcRenderer.invoke(IpcChannels.CONVERSATION_SAVE_LIST, sessionListRaw);
                if (!res.success) {
                    console.error('[ConversationStore] Failed to save conversations to SQLite:', res.error);
                }
            } catch (e) {
                console.error('[ConversationStore] Failed to save to SQLite:', e);
            }
        },

        /**
         * 尝试获取并更新当前会话的 conversation_id
         * @returns 解析出的 conversation_id
         */
        async resolveCurrentConversationId(): Promise<string> {
            const currentSession = this.currentSession;
            if (!currentSession || !currentSession.conv_key) {
                return '';
            }

            if (currentSession.conversation_id) {
                return currentSession.conversation_id;
            }

            try {
                // 1. 尝试从本地数据库中查询
                const localChat = await this.loadSessionFromStorage(currentSession.conv_key);
                if (localChat && localChat.conversation_id) {
                    // await 后再确认会话未切换，才回写
                    if (this.currentSessionKey === currentSession.conv_key) {
                        currentSession.conversation_id = localChat.conversation_id;
                        void this.saveToStorage();
                        this.currentSessionId = localChat.conversation_id;
                    }
                    return localChat.conversation_id;
                }

                // 2. 本地没有，调用 API 从服务端获取
                const res = await getConversation({
                    conversation_id: '',
                    conv_key: currentSession.conv_key,
                    conv_type: currentSession.type
                });

                if (res.data?.conversation?.conversation_id) {
                    const conversationId = res.data.conversation.conversation_id;
                    // await 后再确认会话未切换，才回写
                    if (this.currentSessionKey === currentSession.conv_key) {
                        currentSession.conversation_id = conversationId;
                        void this.saveToStorage();
                        this.currentSessionId = conversationId;
                    }
                    return conversationId;
                }
            } catch (error) {
                console.error('[ConversationStore] Failed to resolve conversation_id:', error);
            }

            return '';
        },
    },
    getters: {
        /**
         * 获取当前聊天
         */
        currentSession: (state) => {
            if (!state.currentSessionKey) {
                return null;
            }
            return state.sessionList.find(c => c.session_key === state.currentSessionKey) || null;
        },
        /**
         * 获取所有聊天的未读消息总数
         */
        totalUnreadCount: (state) => {
            return state.sessionList.reduce((acc, current) => {
                return acc + (current.is_disturb === 2 ? 0 : current.unread_count || 0);
            }, 0);
        },
        /**
         * 获取聊天
         */
        getSession: (state) => (keyOrId: string) => {
            if (!keyOrId) {
                return null;
            }
            return state.sessionList.find(c => c.session_key === keyOrId) || null;
        },
    },
});
