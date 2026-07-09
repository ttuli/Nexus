import { defineStore } from 'pinia';
import { ImTypes } from '@shared/types';
import { Renderer_Config as config } from '@shared/config/constants';
import { judgeSessionType } from '@/src/utils/sessionUtils';
import { seqGt, seqMax, seqPositive, toSeq } from '@shared/utils/seq';

// 离线同步在途标记（模块级，防止挂载同步与重连同步并发重入）
let offlineSyncInFlight = false;

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
                if (patch.last_message_time !== undefined) chat.last_message_time = patch.last_message_time;
                if (patch.last_sender !== undefined) chat.last_sender = patch.last_sender;
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
            this.addOrPinToTop(sessionkey);
            this.currentSessionKey = sessionkey;
            this.clearUnread(sessionkey);
            void this.reportSessionRead(sessionkey);
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
         * 上报会话已读游标到服务端（read_seq = 本地 max_seq）。
         * Lamport seq 不连续，服务端未读数依赖该游标做点查计数；游标单调前进，重复/乱序上报无害。
         */
        async reportSessionRead(sessionkey: string) {
            const chat = this.getSession(sessionkey);
            if (!chat || !chat.session_id || !seqPositive(chat.max_seq)) return;
            try {
                const { markSessionRead } = await import('@/src/apis/message');
                await markSessionRead({
                    session_id: chat.session_id,
                    read_seq: toSeq(chat.max_seq),
                });
            } catch (error) {
                console.error('[SessionStore] reportSessionRead failed:', error);
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
         * 离线同步：
         * 1. 拉取活跃会话，对 server actual_seq > 本地 max_seq 的会话按 seq 区间增量补拉离线消息
         *    （离线期间服务端只存不推，上线后由客户端拉齐）
         * 2. 拉取用户会话列表，以服务端计算的 unread_count（基于已读游标点查）覆盖本地未读数
         */
        async syncOfflineActiveSessions() {
            if (offlineSyncInFlight) return;
            offlineSyncInFlight = true;
            try {
                await this._doSyncOfflineActiveSessions();
            } finally {
                offlineSyncInFlight = false;
            }
        },

        async _doSyncOfflineActiveSessions() {
            const { getOfflineTimestamp } = await import('./init');
            const { getUserActiveConversation, getUserConversations } = await import('@/src/apis/message');
            const { sessionService } = await import('@/src/services/sessionService');
            const { chatService } = await import('@/src/services/chatService');
            const { useMessageStore } = await import('./message');
            const { toRaw } = await import('vue');

            const timestamp = getOfflineTimestamp();

            // ── 1. 活跃会话 + 离线消息增量补拉 ─────────────────────────────
            const res = await getUserActiveConversation({ timestamp });
            if (res.code === 200 && res.data?.sessions) {
                const updatedSessions: ImTypes.Session[] = [];
                for (const ss of res.data.sessions) {
                    if (!ss.session_key) continue;
                    const localMaxSeq = toSeq(this.getSession(ss.session_key)?.max_seq);
                    // Lamport 语义下 max_seq 与 actual_seq 等价（服务端兼容返回）
                    const serverMaxSeq = seqMax(ss.max_seq, ss.actual_seq);

                    const updated = this.upsertSession({
                        session_id: ss.session_id,
                        session_key: ss.session_key,
                        // 服务端 type 为 model 值(1/2)，与前端枚举(0/1)不同，统一由 session_key 推导
                        type: judgeSessionType(ss.session_key),
                        max_seq: serverMaxSeq,
                        last_content: ss.last_content,
                        last_sender: ss.last_sender,
                        create_time: ss.create_time,
                        update_time: ss.update_time,
                    });
                    if (updated) updatedSessions.push(toRaw(updated) as ImTypes.Session);

                    // 本地落后于服务端：按 (localMaxSeq, +∞) 分页拉齐离线消息
                    if (seqGt(serverMaxSeq, localMaxSeq)) {
                        try {
                            const missing = await chatService.fetchMessagesSince(ss.session_key, localMaxSeq);
                            if (missing.length > 0 && this.currentSessionKey === ss.session_key) {
                                const messageStore = useMessageStore();
                                missing.forEach(m => messageStore.upsertMessage(m));
                            }
                        } catch (e) {
                            console.error(`[SessionStore] backfill offline messages for ${ss.session_key} failed:`, e);
                        }
                    }
                }
                if (updatedSessions.length > 0) {
                    void sessionService.saveMany(updatedSessions);
                }
            }

            // ── 2. 服务端未读数对齐（按 session_id 匹配本地会话）─────────────
            try {
                const convRes = await getUserConversations();
                if (convRes.code === 200 && convRes.data?.sessions) {
                    const toPersist: ImTypes.Session[] = [];
                    for (const us of convRes.data.sessions) {
                        const local = this.sessionList.find(c => c.session_id === us.session_id);
                        if (!local) continue;
                        if (local.session_key === this.currentSessionKey) {
                            // 正在查看的会话：本地已读为准，反向推进服务端游标
                            void this.reportSessionRead(local.session_key);
                        } else {
                            local.unread_count = Number(us.unread_count) || 0;
                        }
                        if (us.is_top) local.is_top = us.is_top;
                        if (us.is_disturb) local.is_disturb = us.is_disturb;
                        toPersist.push(toRaw(local) as ImTypes.Session);
                    }
                    if (toPersist.length > 0) {
                        void sessionService.saveMany(toPersist);
                    }
                }
            } catch (e) {
                console.error('[SessionStore] sync server unread counts failed:', e);
            }
        },

        /**
         * 更新会话配置（置顶、免打扰等）并同步到服务器
         * @param sessionKey 本地会话 Key（store 以 session_key 索引；上报服务端时用真实 session_id）
         */
        async updateConversationOptions(sessionKey: string, isTop?: number, isDisturb?: number) {
            const chat = this.getSession(sessionKey);
            if (!chat) return;
            if (isTop === undefined && isDisturb === undefined) return;

            let isTopVal = isTop ?? chat.is_top;
            let isDisturbVal = isDisturb ?? chat.is_disturb;
            chat.is_top = isTopVal;
            chat.is_disturb = isDisturbVal;
            this.sortSessionList();

            // 服务端尚未分配 session_id 的本地会话仅本地生效
            if (!chat.session_id) return;

            try {
                const { updateConversation } = await import('@/src/apis/message');
                await updateConversation({
                    session_id: chat.session_id,
                    is_top: Number(isTopVal),
                    is_disturb: Number(isDisturbVal),
                });
            } catch (error) {
                console.error(error);
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
