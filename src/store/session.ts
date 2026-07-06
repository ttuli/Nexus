import { defineStore } from 'pinia';
import { ImTypes } from '@shared/types';
import { Renderer_Config as config } from '@shared/config/constants';
import { judgeSessionType } from '@/src/utils/sessionUtils';

export const useSessionStore = defineStore('session', {
    state: () => ({
        sessionList: [] as ImTypes.Session[],
        currentSessionKey: '', // 唯一的本地 session_key
    }),
    actions: {
        /**
         * 根据服务端会话数据更新聊天列表（纯内存操作）
         * 已存在：更新 max_seq / update_time，并回填 session_id（如果有的话）
         * 不存在：新建条目，并加入侧边栏列表 (is_in_list = 1)
         * @returns 更新/新建后的 session 对象，供调用方按需持久化
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
        }): ImTypes.Session | null {
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
                if (!sessionKey && !sessionId) return null; // 无法创建
                
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

            return sessionToUpdate;
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
         * 添加或置顶聊天（纯内存操作）
         * 如果已存在则移到第一位，如果不存在则添加到第一位
         */
        addOrPinToTop(sessionKey: string) {
            if (sessionKey === '') return;
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
            if (!sessionkey) {
                this.currentSessionKey = '';
                return;
            }
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
            }
        },

        /**
         * 移除会话（纯内存操作）
         */
        removeSession(sessionkey: string) {
            const index = this.sessionList.findIndex((c) => c.session_key === sessionkey);
            if (index !== -1) {
                this.sessionList.splice(index, 1);
            }
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
         * 用从 SQLite 加载的数据填充 store（由 sessionService 配合调用）
         */
        hydrateFromStorage(sessions: (ImTypes.Session & { is_in_list?: number })[]) {
            this.sessionList = sessions
                .filter((c) => c.is_in_list === 1)
                .map((c) => ({
                    ...c,
                    type: c.type || ImTypes.SessionType.SESSION_TYPE_PRIVATE,
                    session_key: c.session_key || '',
                    last_message_time: c.last_message_time || 0,
                    unread_count: c.unread_count || 0,
                    create_time: c.create_time || 0,
                    update_time: c.update_time || 0,
                    is_top: Number(c.is_top) || 1,
                    is_disturb: Number(c.is_disturb) || 1,
                }));
            this.sortSessionList();
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
