<template>
    <div class="validation-messages">
        <TitleBar title="验证消息" :need-min="false" :need-max="false" class="title-bar" />

        <div class="content">
            <div class="tabs">
                <div class="tab" :class="{ active: type === 'friend' }" @click="type = 'friend'">好友申请</div>
                <div class="tab" :class="{ active: type === 'group' }" @click="type = 'group'">群聊通知</div>
            </div>

            <div class="list" v-if="type === 'friend'">
                <div v-if="friendRequests.length === 0" class="empty">暂无好友申请</div>

                <div v-for="req in friendRequests" :key="req.id" class="req-item"
                    :class="{ unread: isUnread(req, 'friend') }">
                    <div class="avatar-box">
                        <Avatar :uid="getRelatedUserInfo(req)?.user_id || 0"></Avatar>
                    </div>
                    <div class="info">
                        <div class="top">
                            <span class="name">用户 {{ getRelatedUserInfo(req)?.user_name || (req.from_user_id ===
                                userStore.userID ? req.to_user_id : req.from_user_id) }}</span>
                        </div>
                        <div class="msg">留言: {{ req.apply_msg }}</div>
                    </div>
                    <span class="date">{{ formatDate(req.request_time) }}</span>
                    <div class="actions">

                        <template v-if="req.status === ImTypes.ApplyStatus.APPLY_STATUS_PENDING">
                            <template v-if="req.from_user_id !== userStore.userID">
                                <CusButton type="primary" :show-icon="false" class="btn"
                                    @click="handleApply(req, 'accept')">同意</CusButton>
                                <CusButton type="normal" :show-icon="false" class="btn reject"
                                    @click="handleApply(req, 'reject')">拒绝</CusButton>
                            </template>
                            <span v-else class="status-text">等待验证</span>
                        </template>
                        <span v-else class="status-text">{{ getStatusText(req.status) }}</span>
                    </div>
                </div>
            </div>

            <div class="list" v-else>
                <div v-if="groupRequests.length === 0" class="empty">暂无群聊通知</div>

                <div v-for="req in groupRequests" :key="req.id" class="req-item"
                    :class="{ unread: isUnread(req, 'group') }">
                    <div class="avatar-box">
                        <Avatar :uid="getGroupInfo(req.group_id)?.id || 0" type="group"></Avatar>
                    </div>
                    <div class="info">
                        <div class="top">
                            <span class="name">
                                {{ getGroupInfo(req.group_id)?.name || req.group_id }}
                                {{ req.sender_id === userStore.userID ? '' : '- 用户 ' +
                                    (getUserInfo(req.sender_id)?.user_name ||
                                        req.sender_id) + ' 申请加群' }}
                            </span>
                        </div>
                        <div class="msg">留言: {{ req.apply_msg }}</div>
                    </div>
                    <span class="date">{{ formatDate(req.request_time) }}</span>
                    <div class="actions">
                        <template v-if="req.status === ImTypes.GroupApplyStatus.GROUP_APPLY_STATUS_PENDING">
                            <template v-if="req.sender_id !== userStore.userID">
                                <CusButton type="primary" :show-icon="false" class="btn"
                                    @click="handleGroupReq(req, 'accept')">同意</CusButton>
                                <CusButton type="normal" :show-icon="false" class="btn reject"
                                    @click="handleGroupReq(req, 'reject')">拒绝</CusButton>
                            </template>
                            <span v-else class="status-text">等待验证</span>
                        </template>
                        <span v-else class="status-text">{{ getGroupStatusText(req.status) }}</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';

import { useUserStore } from '@/store/user';
import { useGroupStore } from '@/store/group';
import { UpdateAction, ResourceType, ImTypes } from '@/types';
import { cacheService, groupService, websocketService } from '@/services';
import { friendService } from '@/services'
import GlobalLoading from '@/components/GlobalLoading/GlobalLoading';
import { buildVerifyWsMsg, convertApplySrc2FriendSrc } from '@/utils/chat';

const type = ref<'friend' | 'group'>('friend');
const userStore = useUserStore();
const groupStore = useGroupStore();

const enterTimeFriend = ref(Date.now());
const enterTimeGroup = ref(Date.now());

// Capture the time when entering the tab and mark as read
watch(type, (newType) => {
    if (newType === 'friend') {
        enterTimeFriend.value = userStore.lastReadFriendRequestTime; // Use the value BEFORE we update it
        userStore.updateLastReadFriendRequestTime();
    } else {
        enterTimeGroup.value = groupStore.lastReadGroupRequestTime;
        groupStore.updateLastReadGroupRequestTime(userStore.userID);
    }
}, { immediate: true });

const isUnread = (req: any, reqType: 'friend' | 'group') => {
    if (req.status !== ImTypes.ApplyStatus.APPLY_STATUS_PENDING && req.status !== ImTypes.GroupApplyStatus.GROUP_APPLY_STATUS_PENDING) return false;

    // For friend, only receiver sees it as unread
    if (reqType === 'friend' && req.from_user_id === userStore.userID) return false;

    const time = req.handle_time || req.request_time;
    if (reqType === 'friend') {
        return time > enterTimeFriend.value;
    } else {
        return time > enterTimeGroup.value;
    }
};

const friendRequests = computed(() => {
    return Array.from(userStore.friendRequestMap.values()).sort((a, b) => b.request_time - a.request_time);
});

const groupRequests = computed(() => {
    return Array.from(groupStore.groupRequestMap.values()).sort((a, b) => b.request_time - a.request_time);
});

const formatDate = (ts: number) => {
    return new Date(ts).toLocaleDateString();
};

const getStatusText = (status: ImTypes.ApplyStatus) => {
    switch (status) {
        case ImTypes.ApplyStatus.APPLY_STATUS_AGREED: return '已同意';
        case ImTypes.ApplyStatus.APPLY_STATUS_REJECTED: return '已拒绝';
        case ImTypes.ApplyStatus.APPLY_STATUS_IGNORED: return '已忽略';
        default: return '待处理';
    }
};

const getGroupStatusText = (status: ImTypes.GroupApplyStatus) => {
    switch (status) {
        case ImTypes.GroupApplyStatus.GROUP_APPLY_STATUS_ACCEPTED: return '已同意';
        case ImTypes.GroupApplyStatus.GROUP_APPLY_STATUS_REJECTED: return '已拒绝';
        case ImTypes.GroupApplyStatus.GROUP_APPLY_STATUS_IGNORED: return '已忽略';
        default: return '待处理';
    }
};

const getRelatedUserInfo = (req: ImTypes.FriendRequest) => {
    const isSelf = req.from_user_id === userStore.userID;
    const targetId = isSelf ? req.to_user_id : req.from_user_id;
    // 用户信息已在 home/index.vue 预加载，直接从 store 读取
    return userStore.getUser(targetId);
};

const getUserInfo = (userId: number) => {
    return userStore.getUser(userId);
};

const getGroupInfo = (groupId: number) => {
    return groupStore.getGroup(groupId);
};

const handleApply = async (req: ImTypes.FriendRequest, type: 'accept' | 'reject') => {
    const status: ImTypes.ApplyStatus = type === 'accept' ? ImTypes.ApplyStatus.APPLY_STATUS_AGREED : ImTypes.ApplyStatus.APPLY_STATUS_REJECTED;
    try {
        GlobalLoading.show();
        await friendService.handleFriendApply({
            applyId: req.id,
            action: status
        } as any);

        // Cache update is handled by listenerService
        await cacheService.updateItems(UpdateAction.Update, ResourceType.FRIEND_REQUEST, [{ ...req, status }])
        if (status === ImTypes.ApplyStatus.APPLY_STATUS_AGREED) {
            let source: ImTypes.ApplySource;
            if (req.source === ImTypes.ApplySource.APPLY_SOURCE_SEARCH_ACCOUNT ||
                req.source === ImTypes.ApplySource.APPLY_SOURCE_SEARCH_PHONE ||
                req.source === ImTypes.ApplySource.APPLY_SOURCE_SEARCH_NAME) {
                source = ImTypes.ApplySource.APPLY_SOURCE_SEARCH_ACCOUNT;
            } else if (req.source === ImTypes.ApplySource.APPLY_SOURCE_FROM_GROUP) {
                source = ImTypes.ApplySource.APPLY_SOURCE_FROM_GROUP;
            } else {
                source = ImTypes.ApplySource.APPLY_SOURCE_FROM_RECOMMEND;
            }
            await cacheService.updateItems(UpdateAction.Add, ResourceType.FRIEND, [{
                user_id: userStore.getUserID(),
                friend_id: req.from_user_id,
                remark: '',
                blocked: false,
                starred: false,
                create_time: Date.now(),
                source: convertApplySrc2FriendSrc(source),
                extra: ""
            } as ImTypes.Friend])
        }

        const { msg, clientId } = buildVerifyWsMsg(ImTypes.MessageType.FRIEND_REQUEST, { ...req, status })
        websocketService.send(msg, clientId)
    } finally {
        GlobalLoading.close();
    }

};

const handleGroupReq = async (req: ImTypes.GroupApply, actionType: 'accept' | 'reject') => {
    const status: ImTypes.GroupApplyStatus = actionType === 'accept' ? ImTypes.GroupApplyStatus.GROUP_APPLY_STATUS_ACCEPTED : ImTypes.GroupApplyStatus.GROUP_APPLY_STATUS_REJECTED;
    try {
        GlobalLoading.show();
        await groupService.handleGroupApply({
            applyId: req.id,
            action: status as any
        } as any);

        await cacheService.updateItems(UpdateAction.Update, ResourceType.GROUP_APPLY, [{ ...req, status }])

        if (status === ImTypes.GroupApplyStatus.GROUP_APPLY_STATUS_ACCEPTED) {
            await cacheService.updateItems(UpdateAction.Add, ResourceType.GROUP_MEMBER, [{
                group_id: req.group_id,
                members: [req.sender_id],
            }])
        }
        const { msg, clientId } = buildVerifyWsMsg(ImTypes.MessageType.GROUP_REQUEST, { ...req, status })
        websocketService.send(msg, clientId)
    } finally {
        GlobalLoading.close();
    }
};
</script>

<style scoped lang="scss">
@use "@/style/_constant.scss" as *;

.validation-messages {
    height: 100%;
    display: flex;
    flex-direction: column;
    background-color: $bg-body;

    .content {
        flex: 1;
        padding: 20px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
    }

    .tabs {
        display: flex;
        gap: 20px;
        margin-bottom: 20px;
        border-bottom: 1px solid $color-border;
        -webkit-app-region: no-drag;

        .tab {
            padding-bottom: 8px;
            cursor: pointer;
            color: $color-text-secondary;
            font-size: 15px;

            &.active {
                color: $color-primary;
                font-weight: 500;
                border-bottom: 2px solid $color-primary;
            }
        }
    }

    .list {
        flex: 1;
        overflow-y: auto;
    }

    .empty {
        text-align: center;
        color: $color-text-placeholder;
        margin-top: 40px;
    }

    .req-item {
        display: flex;
        align-items: center;
        padding: 16px;
        background-color: $bg-card;
        border-radius: 8px;
        margin-bottom: 12px;
        gap: 16px;
        transition: background-color 0.3s;

        &.unread {
            animation: highlight-yellow 2s ease-out;
        }

        @keyframes highlight-yellow {
            0% {
                background-color: rgba(255, 193, 7, 0.4); // Highlight yellow color
            }

            100% {
                background-color: $bg-card;
            }
        }

        .avatar-box {
            .avatar {
                width: 56px;
                height: 56px;
            }
        }

        .info {
            flex: 1;

            .top {
                display: flex;
                justify-content: space-between;
                margin-bottom: 4px;

                .name {
                    font-weight: 500;
                    font-size: 15px;
                }
            }

            .msg {
                font-size: 13px;
                color: $color-text-secondary;
            }
        }

        .date {
            font-size: 12px;
            color: $color-text-secondary;
        }

        .actions {
            display: flex;
            gap: 10px;

            .btn {
                border-radius: 8px;
                font-size: 13px;
                height: 35px;
                padding: 0 20px;

                &.reject {
                    background-color: #e6e6e6;
                }
            }

            .status-text {
                font-size: 13px;
                color: $color-text-secondary;
            }
        }
    }
}
</style>
