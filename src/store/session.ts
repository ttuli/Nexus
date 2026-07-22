import { defineStore } from 'pinia';
import { ImTypes } from '@shared/types';
import { Renderer_Config as config } from '@shared/config/constants';
import { judgeSessionType } from '@/src/utils/sessionUtils';
import { seqMax, toSeq } from '@shared/utils/seq';

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
            max_seq?: string;
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
                    // Lamport seq 单调不回退：只允许前进
                    existing.max_seq = seqMax(existing.max_seq, sessionObj.max_seq);
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
                    max_seq: toSeq(sessionObj.max_seq),
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
                    max_seq: '0',
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

        /**
         * 更新会话摘要信息（最后消息、时间、发送人等）
         */
        updateSessionSummary(
            sessionKey: string,
            patch: {
                last_content?: string;
                last_message_time?: number;
                last_sender?: number;
                max_seq?: string;
            }
        ): ImTypes.Session | null {
            const chat = this.getSession(sessionKey);
            if (chat) {
                if (patch.last_content !== undefined) chat.last_content = patch.last_content;
                if (patch.last_sender !== undefined) chat.last_sender = patch.last_sender;
                // last_message_time 单调不回退：点击会话重算摘要时，最后一条消息的
                // sendTime（群通知为 op_time）可能早于收到时记录的服务端投递时间戳。
                // 若在此回退，会话会在列表中下沉，且落库时触发 sessionStore SQL 的
                // last_message_time 门控，导致 last_content / last_sender 无法写入。
                if (patch.last_message_time !== undefined) {
                    chat.last_message_time = Math.max(chat.last_message_time || 0, patch.last_message_time);
                }
                if (patch.max_seq !== undefined) chat.max_seq = seqMax(chat.max_seq, patch.max_seq);
                this.sortSessionList();
                return chat;
            }
            return null
        },

        setCurrentSession(sessionkey: string) {
            if (!sessionkey) {
                this.currentSessionKey = '';
                return;
            }
            // 仅在会话不存在时创建并加入列表（好友详情"发消息"等入口可能指向
            // 尚无会话的对象）；已存在的会话保持原位，点击不重排列表顺序
            if (!this.getSession(sessionkey)) {
                this.addOrPinToTop(sessionkey);
            }
            this.currentSessionKey = sessionkey;
            this.clearUnread(sessionkey);
            // 已读游标上报（I/O）不在此处：由编排层（sessionActions.reportSessionRead）
            // 在切换会话等入口处显式触发，store 保持纯状态
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
                    max_seq: toSeq(c.max_seq),
                    last_message_time: c.last_message_time || 0,
                    unread_count: c.unread_count || 0,
                    create_time: c.create_time || 0,
                    update_time: c.update_time || 0,
                    is_top: Number(c.is_top) || 1,
                    is_disturb: Number(c.is_disturb) || 1,
                }));
            this.sortSessionList();
        },

        /**
         * 更新会话配置（置顶、免打扰等，纯内存操作）
         * @returns 更新后的 session，供编排层（sessionActions）同步服务端；无效入参返回 null
         */
        setSessionOptions(sessionKey: string, isTop?: number, isDisturb?: number): ImTypes.Session | null {
            const chat = this.getSession(sessionKey);
            if (!chat) return null;
            if (isTop === undefined && isDisturb === undefined) return null;

            chat.is_top = isTop ?? chat.is_top;
            chat.is_disturb = isDisturb ?? chat.is_disturb;
            this.sortSessionList();
            return chat;
        },

        /**
         * 以服务端下发的会话元数据对齐本地（未读数/置顶/免打扰，纯内存操作）。
         * unread_count 传 undefined 表示不覆盖（正在查看的会话以本地已读为准）；
         * is_top/is_disturb 仅在服务端有值（非 0）时覆盖。
         * @returns 对齐后的 session，供调用方持久化；本地无此会话返回 null
         */
        syncServerSessionMeta(
            sessionId: string,
            meta: { unread_count?: number; is_top?: number; is_disturb?: number }
        ): ImTypes.Session | null {
            const local = this.sessionList.find(c => c.session_id === sessionId);
            if (!local) return null;
            if (meta.unread_count !== undefined) local.unread_count = meta.unread_count;
            if (meta.is_top) local.is_top = meta.is_top;
            if (meta.is_disturb) local.is_disturb = meta.is_disturb;
            return local;
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
