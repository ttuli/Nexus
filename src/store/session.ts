import { defineStore } from 'pinia';
import { ImTypes, IpcChannels } from '@/src/types';
import { windowService } from '@/src/services';
import { Renderer_Config as config } from '@/src/config/constants';
import { judgeSessionType } from '@/src/utils/sessionUtils';

export const useSessionStore = defineStore('session', {
    state: () => ({
        sessionList: [] as ImTypes.Session[],
        currentSessionKey: '', // 唯一的本地 session_key
    }),
    actions: {
        /**
         * 根据服务端会话数据更新聊天列表
         * 已存在：更新 max_seq / update_time，并回填 session_id（如果有的话）
         * 不存在：新建条目，并加入侧边栏列表 (is_in_list = 1)
         */
        upsertSession(sessionObj: {
            session_id?: string;
            session_type?: number;
            type?: ImTypes.SessionType;
            session_key: string;
            max_seq?: number;
            update_time?: number;
            last_content?: string;
            last_sender?: number;
            create_time?: number;
            is_top?: number;
            is_disturb?: number;
        }) {
            const sessionId = sessionObj.session_id;
            const sessionKey = sessionObj.session_key;
            const type = sessionObj.type !== undefined
                ? sessionObj.type
                : judgeSessionType(sessionKey)

            // 优先通过 session_id，其次通过 session_key 检索本地已存在的会话
            let existing = this.sessionList.find(
                c => (sessionId && c.session_id === sessionId) ||
                    (sessionKey && c.session_key === sessionKey)
            );

            let sessionToUpdate: ImTypes.Session;

            if (existing) {
                // 如果存在，回填缺少的 ID
                if (sessionId && !existing.session_id) {
                    existing.session_id = sessionId;
                }
                if (sessionKey && !existing.session_key) {
                    existing.session_key = sessionKey;
                }

                if (type !== undefined) existing.type = type;

                if (sessionObj.max_seq !== undefined) {
                    const delta = Math.max(0, sessionObj.max_seq - (existing.max_seq || 0));
                    if (delta > 0) {
                        windowService.playNotificationSound();
                    }
                    existing.unread_count = (existing.unread_count || 0) + delta;
                    existing.max_seq = sessionObj.max_seq;
                }
                
                if (sessionObj.update_time !== undefined) {
                    existing.update_time = sessionObj.update_time;
                    existing.last_message_time = sessionObj.update_time;
                }
                if (sessionObj.last_content !== undefined) existing.last_content = sessionObj.last_content;
                if (sessionObj.last_sender !== undefined) existing.last_sender = sessionObj.last_sender;
                if (sessionObj.is_top !== undefined) existing.is_top = sessionObj.is_top;
                if (sessionObj.is_disturb !== undefined) existing.is_disturb = sessionObj.is_disturb;
                
                sessionToUpdate = existing;
                // 当已存在会话的时间或内容更新时，重新排序以确保会话列表顺序正确
                this.sortSessionList();
            } else {
                if (!sessionKey && !sessionId) return; // 无法创建
                
                // 不存在，新建会话
                const newChat: ImTypes.Session & { is_in_list?: number } = {
                    session_id: sessionId || '',
                    session_key: sessionKey || '',
                    type: type || ImTypes.SessionType.SESSION_TYPE_PRIVATE,
                    max_seq: sessionObj.max_seq || 0,
                    last_sender: sessionObj.last_sender || 0,
                    last_content: sessionObj.last_content || '',
                    last_message_time: sessionObj.update_time || Date.now(),
                    unread_count: 0,
                    create_time: sessionObj.create_time || Date.now(),
                    update_time: sessionObj.update_time || Date.now(),
                    is_top: sessionObj.is_top !== undefined ? sessionObj.is_top : 1,
                    is_disturb: sessionObj.is_disturb !== undefined ? sessionObj.is_disturb : 1,
                    is_in_list: 1, // 服务端推送的活动会话默认加入列表
                };
                this.sessionList.unshift(newChat);
                this.sortSessionList();

                // 超过最大数量时，移除最后一个
                if (this.sessionList.length > config.maxSessionListCount) {
                    this.sessionList.pop();
                }
                sessionToUpdate = newChat;
            }
            
            // 使用 IPC 批量更新（虽然这里只更新当前的一条）
            void window.ipcRenderer.invoke(IpcChannels.SESSION_SAVE_LIST, [JSON.parse(JSON.stringify(sessionToUpdate))]).catch(e => {
                console.error('[SessionStore] Failed to save session in SQLite:', e);
            });
        },

        /**
         * 增加未读数
         */
        incrementUnread(sessionkey: string) {
            const chat = this.getSession(sessionkey);
            if (chat) {
                chat.unread_count++
            }
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
            }
        },

        setCurrentSession(sessionkey: string) {
            this.addOrPinToTop(sessionkey);
            this.currentSessionKey = sessionkey;
            this.clearUnread(sessionkey);
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
         * 移除聊天
         */
        removeSession(sessionkey: string) {
            const index = this.sessionList.findIndex((c) => c.session_key === sessionkey);
            if (index !== -1) {
                this.sessionList.splice(index, 1);
            }
            void window.ipcRenderer.invoke(IpcChannels.SESSION_DELETE, sessionkey).catch((e) => {
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
                const res = await window.ipcRenderer.invoke(IpcChannels.SESSION_GET_LIST);
                if (res.success && Array.isArray(res.data)) {
                    // 仅加载 is_in_list === 1 的活跃聊天列表
                    this.sessionList = res.data
                        .filter((c: any) => c.is_in_list === 1)
                        .map((c: any) => ({
                            ...c,
                            type: c.type || ImTypes.SessionType.SESSION_TYPE_PRIVATE,
                            session_key: c.session_key || c.session_key || '',
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
        async loadSessionFromStorage(keyOrId: string): Promise<ImTypes.Session | null> {
            try {
                const res = await window.ipcRenderer.invoke(IpcChannels.SESSION_GET, keyOrId);
                if (res.success && res.data) {
                    return {
                        ...res.data,
                        type: res.data.type || ImTypes.SessionType.SESSION_TYPE_PRIVATE,
                        session_key: res.data.session_key || res.data.session_id || '',
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
                const res = await window.ipcRenderer.invoke(IpcChannels.SESSION_SAVE_LIST, sessionListRaw);
                if (!res.success) {
                    console.error('[ConversationStore] Failed to save conversations to SQLite:', res.error);
                }
            } catch (e) {
                console.error('[ConversationStore] Failed to save to SQLite:', e);
            }
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

        currentSessionType: (state) => {
            return judgeSessionType(state.currentSessionKey);
        }
    },
});
