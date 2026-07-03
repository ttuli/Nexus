import { defineStore } from 'pinia';
import { useSessionStore } from './session';
import { IChatMessage } from '@/src/types/chatMessage';
import { chatService } from '@/src/services';
import { messageService } from '@/src/services';
import { getLastContent } from '@/src/utils/messageConverter';
import { useUserStore } from '@/src/store/user';

export const useMessageStore = defineStore('message', {
    state: () => ({
        messages: [] as IChatMessage[],
        isLoading: false,
        hasMore: true,
        pageSize: 20
    }),
    actions: {
        /**
         * 更新文件消息的本地路径（下载完成后使用）
         */
        updateFileLocalPath(sessionkey: string, msgId: string, localPath: string) {
            const conversationStore = useSessionStore();
            if (conversationStore.currentSessionKey !== sessionkey) return;
            const msg = this.messages.find(m =>
                (msgId && m.msgId === msgId)
            ) as any;
            if (msg) {
                msg.localPath = localPath;
            }
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
                            const userStore = useUserStore();
                            const getUserName = (userId: number) => {
                                const friend = userStore.getFriend(userId);
                                if (friend?.remark) return friend.remark;
                                const user = userStore.getUser(userId);
                                return user?.user_name || '';
                            };
                            cur.last_content = getLastContent(latestMsg, userStore.userID, getUserName);
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
         * 更新消息状态（供 Listener 更新服务端返回的 ack / recall 状态使用）
         */
        updateMessageStatus(msgId: string, clientId: string, status: number) {
            const msg = this.messages.find(m =>
                (clientId && m.clientId === clientId) ||
                (msgId && m.msgId === msgId)
            );
            if (msg) {
                msg.status = status;
            }
        },

        /**
         * 添加消息
         */
        upsertMessage(message: IChatMessage) {
            const msg = this.messages.find(m =>
                (message.clientId && message.clientId === m.clientId) ||
                (message.msgId && message.msgId === m.msgId)
            );
            if (!msg) {
                this.messages.push(message);
            } else {
                msg.seq = message.seq || msg.seq;
                msg.msgId = message.msgId || msg.msgId;
                msg.status = message.status || msg.status;
                msg.sendTime = message.sendTime || msg.sendTime;
            }
        }
    }
});
