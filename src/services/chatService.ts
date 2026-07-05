import { getHistory } from '@/src/apis/message';
import { ApiTypes, ImTypes, PartialExcept, ResourceType, UpdateAction } from '@/src/types';
import { MessageStatus, MessageType } from '@/src/types/proto';
import { IChatMessage } from '@/src/types/chatMessage';

import { convertNotificationToChatMessage } from '@/src/utils/messageConverter';
import cacheService from './cacheService';
import groupService from './groupService';
import { messageService } from './messageService';

class ChatService {
    
    private normalizeNumber(value: unknown): number {
        if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
        if (typeof value === 'string') {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : 0;
        }
        return 0;
    }

    private parseExtra(extraRaw: string): Record<string, unknown> {
        if (!extraRaw) return {};
        try {
            const parsed = JSON.parse(extraRaw);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
            return parsed as Record<string, unknown>;
        } catch {
            return {};
        }
    }

    private toStringMap(value: unknown): Record<string, string> | undefined {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
        const obj = value as Record<string, unknown>;
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(obj)) {
            out[k] = String(v ?? '');
        }
        return Object.keys(out).length > 0 ? out : undefined;
    }

    private mapApiMessage(message: ApiTypes.message.Message): IChatMessage | null {
        const extra = this.parseExtra(message.extra);
        const type = this.normalizeNumber(message.msg_type) as MessageType;
        const status = this.normalizeNumber(message.status) as MessageStatus;

        const common = {
            msgId: message.msg_id || '',
            sessionId: message.session_id || '',
            fromUserId: this.normalizeNumber(message.from_user_id),
            sendTime: this.normalizeNumber(message.create_time) || Date.now(),
            seq: this.normalizeNumber(message.seq),
            status: status || MessageStatus.MESSAGE_STATUS_UNSPECIFIED,
            isRead: false,
            clientId: message.client_id || '',
            ext: this.toStringMap(extra.ext),
        };

        if (type === MessageType.CHAT_TEXT || type === MessageType.GROUP_TEXT) {
            const atList = Array.isArray(extra.at_list) ? extra.at_list : [];
            return {
                ...common,
                type,
                content: message.content || '',
                atList: atList as any[],
            };
        }

        if (type === MessageType.CHAT_IMAGE || type === MessageType.GROUP_IMAGE) {
            return {
                ...common,
                type,
                url: message.media_url || message.content || '',
                thumbnailUrl: typeof extra.thumbnail_url === 'string' ? extra.thumbnail_url : undefined,
                width: this.normalizeNumber(extra.MESSAGE_EXTRA_KEY_WIDTH || extra.width),
                height: this.normalizeNumber(extra.MESSAGE_EXTRA_KEY_HEIGHT || extra.height),
                thumbnailWidth: this.normalizeNumber(extra.MESSAGE_EXTRA_KEY_THUMB_WIDE || extra.thumbnailWidth),
                thumbnailHeight: this.normalizeNumber(extra.MESSAGE_EXTRA_KEY_THUMB_HEIGHT || extra.thumbnailHeight),
                size: this.normalizeNumber(extra.MESSAGE_EXTRA_KEY_SIZE || extra.size),
                format: typeof extra.MESSAGE_EXTRA_KEY_FORMAT === 'string' 
                    ? extra.MESSAGE_EXTRA_KEY_FORMAT 
                    : typeof extra.format === 'string' ? extra.format : '',
                fileName: typeof extra.MESSAGE_EXTRA_KEY_NAME === 'string' ? extra.MESSAGE_EXTRA_KEY_NAME : undefined,
            };
        }

        if (type === MessageType.CHAT_VIDEO || type === MessageType.GROUP_VIDEO) {
            return {
                ...common,
                type,
                url: message.media_url || message.content || '',
                thumbnailUrl: typeof extra.thumbnail_url === 'string' ? extra.thumbnail_url : undefined,
                duration: this.normalizeNumber(extra.MESSAGE_EXTRA_KEY_DURATION || extra.duration),
                width: this.normalizeNumber(extra.MESSAGE_EXTRA_KEY_WIDTH || extra.width),
                height: this.normalizeNumber(extra.MESSAGE_EXTRA_KEY_HEIGHT || extra.height),
                thumbnailWidth: this.normalizeNumber(extra.MESSAGE_EXTRA_KEY_THUMB_WIDE || extra.thumbnailWidth),
                thumbnailHeight: this.normalizeNumber(extra.MESSAGE_EXTRA_KEY_THUMB_HEIGHT || extra.thumbnailHeight),
                size: this.normalizeNumber(extra.MESSAGE_EXTRA_KEY_SIZE || extra.size),
                format: typeof extra.MESSAGE_EXTRA_KEY_FORMAT === 'string' 
                    ? extra.MESSAGE_EXTRA_KEY_FORMAT 
                    : typeof extra.format === 'string' ? extra.format : '',
                fileName: typeof extra.MESSAGE_EXTRA_KEY_NAME === 'string' ? extra.MESSAGE_EXTRA_KEY_NAME : '',
            };
        }

        if (type === MessageType.CHAT_FILE || type === MessageType.GROUP_FILE) {
            return {
                ...common,
                type,
                url: message.media_url || '',
                fileName: typeof extra.MESSAGE_EXTRA_KEY_NAME === 'string'
                    ? extra.MESSAGE_EXTRA_KEY_NAME
                    : typeof extra.file_name === 'string'
                        ? extra.file_name
                        : typeof extra.fileName === 'string'
                            ? extra.fileName
                            : message.content || '',
                size: this.normalizeNumber(extra.MESSAGE_EXTRA_KEY_SIZE || extra.size),
                format: typeof extra.MESSAGE_EXTRA_KEY_FORMAT === 'string' 
                    ? extra.MESSAGE_EXTRA_KEY_FORMAT 
                    : typeof extra.format === 'string' ? extra.format : '',
            };
        }

        return null;
    }

    /**
     * 与后端 FindByConversation 对齐：
     * startSeq/endSeq 负数表示无界；非负表示闭区间边界。
     * 向旧消息拉取：startSeq=-1, endSeq=upper → DESC
     * 首次拉取：startSeq=-1, endSeq=-1 → DESC，取最新 limit 条
     */
    private async fetchHistoryFromApi(
        sessionKey: string,
        pageSize: number,
        range?: { startSeq?: number; endSeq?: number }
    ): Promise<IChatMessage[]> {
        const params: PartialExcept<ApiTypes.message.GetHistoryReq, 'session_id'> = {
            session_id: sessionKey,
            limit: pageSize,
        };

        const startSeq = range?.startSeq !== undefined ? this.normalizeNumber(range.startSeq) : -1;
        const endSeq = range?.endSeq !== undefined ? this.normalizeNumber(range.endSeq) : -1;
        params.start_seq = startSeq;
        params.end_seq = endSeq;

        const resp = await getHistory(params);
        const list: ApiTypes.message.Message[] = Array.isArray(resp.data?.list) ? resp.data.list : [];
        let messages = list
            .map((item: ApiTypes.message.Message) => this.mapApiMessage(item))
            .filter((item: IChatMessage | null): item is IChatMessage => item !== null);

        if (startSeq >= 0 || endSeq >= 0) {
            messages = messages.filter((item) => {
                const seq = this.normalizeNumber(item.seq);
                if (seq <= 0) return true;
                if (startSeq >= 0 && seq < startSeq) return false;
                if (endSeq >= 0 && seq > endSeq) return false;
                return true;
            });
        }

        messages.sort((a, b) => {
            const seqA = this.normalizeNumber(a.seq);
            const seqB = this.normalizeNumber(b.seq);
            if (seqA > 0 && seqB > 0 && seqA !== seqB) return seqA - seqB;

            const timeA = this.normalizeNumber(a.sendTime);
            const timeB = this.normalizeNumber(b.sendTime);
            if (timeA !== timeB) return timeA - timeB;

            const keyA = `${a.msgId || ''}-${a.clientId || ''}`;
            const keyB = `${b.msgId || ''}-${b.clientId || ''}`;
            return keyA.localeCompare(keyB);
        });

        if (messages.length > 0) {
            // 保存前确保每条消息携带 sessionKey，供 DB 层按 session_key 索引存储
            const toSave = messages.map(m => (m.sessionKey ? m : { ...m, sessionKey }));
            await messageService.saveMessages(toSave);
        }

        return messages;
    }

    async getMessagesBySeqRange(
        sessionId: string,
        startSeq: number,
        endSeq: number,
        pageSize: number = 200
    ): Promise<IChatMessage[]> {
        const start = this.normalizeNumber(startSeq);
        const end = this.normalizeNumber(endSeq);
        if (!sessionId || start <= 0 || end <= 0 || start > end || pageSize <= 0) {
            return [];
        }

        return this.fetchHistoryFromApi(sessionId, pageSize, { startSeq: start, endSeq: end });
    }

    /**
     * Get history messages for a session.
     * @param sessionId The session ID to fetch messages for.
     * @param beforeSeq 排他性上界，拉取 seq < beforeSeq 的消息；undefined 表示首次加载，拉取最新一页。
     * @param pageSize Number of messages to fetch.
     */
    async getHistoryMessages(
        sessionKey: string,
        beforeSeq?: number,
        pageSize: number = 20,
    ): Promise<IChatMessage[]> {
        if (!sessionKey || pageSize <= 0) return [];

        // 本地查询：session_key 精确匹配，beforeSeq 直接传给 DB 层（排他上界：seq < beforeSeq）
        // 首次加载（beforeSeq === undefined）传 Number.MAX_SAFE_INTEGER 表示不限上界
        const local = await messageService.getLocalHistoryMessages(
            sessionKey,
            beforeSeq !== undefined ? beforeSeq : Number.MAX_SAFE_INTEGER,
            pageSize
        );

        // 如果本地数据能填满一页，直接返回
        if (local.length === pageSize) {
            return local;
        }

        // 本地未命中或数量不足，从远端 API 拉取以填补空缺
        // beforeSeq 有值：endSeq = beforeSeq - 1；无值（首次加载）：endSeq = -1（后端取最新）
        const endSeq = beforeSeq !== undefined && beforeSeq > 0 ? beforeSeq - 1 : -1;
        const apiMessages = await this.fetchHistoryFromApi(sessionKey, pageSize, { startSeq: -1, endSeq });

        // 如果 API 返回了新数据，说明填补了空缺，重新从本地查一次（确保混合本地 unconfirmed 消息并正确排序）
        if (apiMessages.length > 0) {
            return await messageService.getLocalHistoryMessages(
                sessionKey,
                beforeSeq !== undefined ? beforeSeq : Number.MAX_SAFE_INTEGER,
                pageSize
            );
        }

        // 如果 API 也没有更多数据，就返回仅有的 local 数据
        return local;
    }

    async parseGroupNotification(wsMsg: ImTypes.WSMessage) {
        const groupNotification = ImTypes.GroupNotification.decode(wsMsg.payload);
        const msg = convertNotificationToChatMessage(groupNotification);

        let shouldIncrementUnread = false;
        let shouldPlaySound = false;

        switch (groupNotification.op_type) {
            case ImTypes.GroupOperationType.GROUP_OP_CREATE:
                if (groupNotification.group_info) {
                    await cacheService.updateItems(UpdateAction.Add, ResourceType.GROUP, [groupNotification.group_info as unknown as ImTypes.GroupInfo]);
                    await cacheService.updateItems(UpdateAction.Add, ResourceType.GROUP_JOINED, [groupNotification.group_info.id]);
                }
                shouldIncrementUnread = true;
                shouldPlaySound = true;
                break;
            case ImTypes.GroupOperationType.GROUP_OP_DISMISS:
                break;
            case ImTypes.GroupOperationType.GROUP_OP_JOIN:
                let group = await groupService.fetchByIds([groupNotification.group_id]);
                if (group.length > 0) {
                    group[0].member_count++;
                    await cacheService.updateItems(UpdateAction.Update, ResourceType.GROUP, [group[0]]);
                }
                break;
            case ImTypes.GroupOperationType.GROUP_OP_LEAVE:
                break;
            case ImTypes.GroupOperationType.GROUP_OP_KICK:
                break;
            case ImTypes.GroupOperationType.GROUP_OP_INVITE:
                break;
            case ImTypes.GroupOperationType.GROUP_OP_UPDATE_INFO:
                break;
            case ImTypes.GroupOperationType.GROUP_OP_MUTE:
                break;
            case ImTypes.GroupOperationType.GROUP_OP_UNMUTE:
                break;
            case ImTypes.GroupOperationType.UNRECOGNIZED:
                break;
        }

        return {
            msg,
            sessionId: msg.sessionId,
            shouldIncrementUnread,
            shouldPlaySound,
        };
    }

}

export const chatService = new ChatService();
