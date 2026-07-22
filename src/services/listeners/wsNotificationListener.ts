/**
 * WebSocket 业务通知监听器
 * 处理 WS_NOTIFICATION IPC 频道
 * 负责处理好友请求、好友变更、群组申请、群操作通知、消息撤回等业务事件
 */

import { ipcService } from '../ipcService'
import { useUserStore } from '@/src/store/user'
import { useGroupStore } from '@/src/store/group'
import { ResourceType, IpcChannels, UpdateAction, ImTypes, ValidationType, ILocalSystemMessage } from '@shared/types'
import { currentValidationTab } from '@/src/composables/useValidationTab'
import { useRouter } from 'vue-router'
import { useSessionStore } from '@/src/store/session'
import { useMessageStore } from '@/src/store/message'
import { toRaw } from 'vue'
import { seqMax } from '@shared/utils/seq'
import { generateGroupSessionId, generateSessionId } from '@/src/utils/sessionUtils';
import { convertApplySrc2FriendSrc, formatSystemMessage } from '@/src/utils/messageConverter';
import { createGroupNameResolver } from '@/src/utils/displayName';
import windowService from '../windowService'
import cacheService from '../cacheService'
import groupService from '../groupService'
import userService from '../userService'
import { sessionService } from '../sessionService'
import { chatService } from '../chatService'

export function initWsNotificationListener(): void {
    ipcService.on(IpcChannels.WS_NOTIFICATION, async (_event, data: { type: ImTypes.MessageType; payload: ImTypes.WSMessage }) => {
        const userStore = useUserStore()
        const sessionStore = useSessionStore()
        const messageStore = useMessageStore()
        const groupStore = useGroupStore()
        const router = useRouter()

        switch (data.type) {
            case ImTypes.MessageType.FRIEND_REQUEST: {
                const friendRequest = ImTypes.FriendRequest.decode(data.payload.payload)
                await cacheService.updateItems(UpdateAction.Update, ResourceType.FRIEND_REQUEST, [friendRequest])
                if (friendRequest.status === ImTypes.ApplyStatus.APPLY_STATUS_AGREED) {
                    await cacheService.updateItems(UpdateAction.Add, ResourceType.FRIEND, [{
                        user_id: userStore.getUserID(),
                        friend_id: friendRequest.to_user_id,
                        remark: '',
                        starred: false,
                        blocked: false,
                        source: convertApplySrc2FriendSrc(friendRequest.source),
                        create_time: friendRequest.handle_time,
                        extra: '',
                    }])
                    sessionStore.addOrPinToTop(generateSessionId(friendRequest.from_user_id, friendRequest.to_user_id))
                }
                if (router.currentRoute.value.path.includes('contacts') && await windowService.isFocused() && currentValidationTab.value === ValidationType.Friend) {
                    userStore.updateLastReadFriendRequestTime()
                }
                break
            }

            case ImTypes.MessageType.FRIEND_ADD: {
                const friend = ImTypes.Friend.decode(data.payload.payload)
                await cacheService.updateItems(UpdateAction.Update, ResourceType.FRIEND, [friend])
                sessionStore.addOrPinToTop(generateSessionId(friend.friend_id, friend.user_id))
                break
            }

            case ImTypes.MessageType.FRIEND_DELETED: {
                const friend = ImTypes.Friend.decode(data.payload.payload)
                await cacheService.updateItems(UpdateAction.Delete, ResourceType.FRIEND, [friend])
                break
            }

            case ImTypes.MessageType.GROUP_REQUEST: {
                const groupRequest = ImTypes.GroupApply.decode(data.payload.payload)
                await cacheService.updateItems(UpdateAction.Update, ResourceType.GROUP_APPLY, [groupRequest])
                if (groupRequest.status === ImTypes.GroupApplyStatus.GROUP_APPLY_STATUS_ACCEPTED) {
                    const groups = await groupService.fetchByIds([groupRequest.group_id])
                    if (groups.length > 0) {
                        const updated = { ...groups[0], member_count: groups[0].member_count + 1 }
                        await cacheService.updateItems(UpdateAction.Update, ResourceType.GROUP, [updated])
                        await cacheService.updateItems(UpdateAction.Add, ResourceType.GROUP_JOINED, [updated.id])
                    }
                }
                if (router.currentRoute.value.path.includes('contacts') && await windowService.isFocused() && currentValidationTab.value === ValidationType.Group) {
                    groupStore.updateLastReadGroupRequestTime(userStore.userID)
                }
                sessionStore.addOrPinToTop(generateGroupSessionId(groupRequest.group_id))
                break
            }

            // 入群邀请：经路由表定向投递给被邀请者本人（social.GroupInvite 载荷）。
            // 写入邀请收件箱即可，此时用户尚未入群，不建立群会话。
            case ImTypes.MessageType.GROUP_INVITE: {
                const invite = ImTypes.GroupInvite.decode(data.payload.payload)
                groupStore.setGroupInvites([invite])
                // 预取群与邀请人信息供收件箱展示（缓存优先，未命中由主进程回源）
                const prefetch: Promise<unknown>[] = []
                if (invite.group_id) prefetch.push(groupService.fetchByIds([invite.group_id]))
                if (invite.inviter_id && !userStore.getUser(invite.inviter_id)) {
                    prefetch.push(userService.fetchByIds([invite.inviter_id]).then(users => {
                        users.forEach(u => userStore.setUser(u))
                    }))
                }
                await Promise.allSettled(prefetch)
                // 正在查看群聊通知标签时即时标记已读，避免红点闪烁
                if (router.currentRoute.value.path.includes('contacts') && await windowService.isFocused() && currentValidationTab.value === ValidationType.Group) {
                    groupStore.updateLastReadGroupRequestTime(userStore.userID)
                }
                break
            }

            // 统一通知消息：群操作、消息撤回等控制类事件的统一载体。
            // 载荷为 NotifyMessage 信封（base + oneof body），落库分配的
            // msg_id / session_id / seq 在 WSMessage 顶层回填。
            case ImTypes.MessageType.GROUP_OP_NOTIFICATION: {
                const notify = ImTypes.NotifyMessage.decode(data.payload.payload)
                const envelope = {
                    msgId: data.payload.msg_id,
                    sessionId: data.payload.session_id || notify.base?.session_id,
                    seq: data.payload.msg_seq,
                }

                if (notify.group_notify) {
                    const result = await chatService.parseGroupNotification(notify.group_notify, envelope)
                    if (result.msg) {
                        // session_key 由 group_id 派生恒有值；base.session_key 可能缺失，不可依赖
                        const sessionKey = result.sessionKey || ''
                        const isFromSelf = notify.group_notify.operator_id === userStore.getUserID()
                        const isCurrentSession = sessionStore.currentSessionKey === sessionKey

                        // 操作者/目标用户可能从未缓存过（非好友被拉群、群成员互不相识、换设备后本地无数据），
                        // fetchByIds 为缓存优先：命中时零网络开销，未命中由主进程自动回源 API 并落盘
                        const missingIds = Array.from(new Set(
                            [notify.group_notify.operator_id, ...(notify.group_notify.target_ids || [])]
                                .filter(id => id && id !== userStore.getUserID() && !userStore.getUser(id))
                        ))
                        if (missingIds.length > 0) {
                            try {
                                const users = await userService.fetchByIds(missingIds)
                                users.forEach(u => userStore.setUser(u))
                            } catch (e) {
                                // 拉取失败不阻塞通知处理，名字降级为 "用户{id}"
                                console.error('[WsNotificationListener] fetch users for group notification failed:', e)
                            }
                        }

                        const updatedSession = sessionStore.upsertSession({
                            session_id: envelope.sessionId,
                            session_key: sessionKey,
                            type: ImTypes.SessionType.SESSION_TYPE_GROUP,
                            // 真实 seq 由服务端在 WSMessage 顶层回填，base 内为发送方原值，仅作兜底
                            max_seq: seqMax(envelope.seq, notify.base?.msg_seq),
                            update_time: data.payload.timestamp || result.msg.sendTime,
                            // 系统消息无发送者语义，置 0 避免会话预览携带 "xx:" 前缀
                            last_sender: 0,
                            last_content: formatSystemMessage(result.msg as ILocalSystemMessage, userStore.getUserID(), createGroupNameResolver(notify.group_notify.group_id)),
                        })
                        messageStore.upsertMessage(result.msg)

                        // 正在查看的会话不累计未读，改为即时前进服务端已读游标
                        if (isCurrentSession) {
                            void sessionStore.reportSessionRead(sessionKey)
                        } else if (result.shouldIncrementUnread && !isFromSelf) {
                            sessionStore.incrementUnread(sessionKey)
                        }
                        // 正在查看的会话与免打扰会话静默（is_disturb: 2=开启）
                        const isDisturbMuted = sessionStore.getSession(sessionKey)?.is_disturb === 2
                        if (result.shouldPlaySound && !isFromSelf && !isCurrentSession && !isDisturbMuted) {
                            windowService.playNotificationSound()
                        }
                        // 持久化通知消息与会话摘要到本地 SQLite
                        void ipcService.invoke(IpcChannels.MSG_SAVE, JSON.parse(JSON.stringify(toRaw(result.msg))));
                        if (updatedSession) {
                            void sessionService.saveMany([toRaw(updatedSession) as ImTypes.Session])
                        }
                    }
                } else if (notify.recall) {
                    // 撤回者 / 会话由信封 base 承载；msg_id 指被撤回的消息
                    const sessionId = envelope.sessionId || ''
                    const updatedMsg = messageStore.updateMessageStatus(sessionId, '', ImTypes.MessageStatus.MESSAGE_STATUS_RECALLED, notify.recall.recall_time, notify.recall.msg_id)
                    if (updatedMsg) {
                        // 同步更新本地 SQLite 的消息撤回状态
                        void ipcService.invoke(IpcChannels.MSG_SAVE, JSON.parse(JSON.stringify(toRaw(updatedMsg))));
                    }
                }
                break
            }
        }
    })
}
