<template>
    <SearchResultCard
        :uid="groupInfo.id"
        avatar-type="group"
        :name="groupInfo.name || '未命名群组'"
        :keyword="keyword"
        :highlighted="isJoined"
    >
        <template #details>
            <div class="sub-info">
                <span class="label">群号:</span>
                <span class="value"><HighlightText :text="String(groupInfo.id)" :keyword="keyword" /></span>
            </div>
            <div class="sub-info">
                <span class="label">成员:</span>
                <span class="value">{{ groupInfo.member_count }}人</span>
            </div>
        </template>

        <template #action>
            <button v-if="isJoined" class="status-btn success" disabled>已加入</button>
            <button v-else-if="isApplying" class="status-btn warning" disabled>等待验证</button>
            <button v-else class="action-btn" @click="$emit('join', groupInfo)">申请加入</button>
        </template>
    </SearchResultCard>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { ImTypes } from '@shared/types';
import { useGroupStore } from '@/src/store/group';
import { useUserStore } from '@/src/store/user';
import SearchResultCard from './SearchResultCard.vue';

const props = defineProps<{
    groupInfo: ImTypes.GroupInfo;
    keyword?: string;
}>();

defineEmits<{
    (e: 'join', group: ImTypes.GroupInfo): void;
}>();

const groupStore = useGroupStore();
const userStore = useUserStore();
const isJoined = computed(() => groupStore.isJoinedGroup(props.groupInfo.id));

const isApplying = computed(() => {
    for (const req of groupStore.groupRequestMap.values()) {
        if (
            req.group_id === props.groupInfo.id &&
            req.sender_id === userStore.userID &&
            req.status === ImTypes.GroupApplyStatus.GROUP_APPLY_STATUS_PENDING
        ) {
            return true;
        }
    }
    for (const req of groupStore.groupInviteMap.values()) {
        if (
            req.group_id === props.groupInfo.id &&
            req.invitee_id === userStore.userID &&
            req.status === ImTypes.InviteStatus.INVITE_STATUS_PENDING
        ) {
            return true;
        }
    }
    return false;
});
</script>
