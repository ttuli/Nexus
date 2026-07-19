<template>
    <div class="group-members-card">
        <div class="header">
            <span class="title">群成员 ({{ members.length }})</span>
            <span class="view-all" v-if="members.length > displayMembers.length" @click="$emit('view-all')">
                查看全部 > <el-icon><i class="el-icon-arrow-right"></i></el-icon>
            </span>
        </div>
        <div class="members-grid">
            <div class="member-item" v-for="member in displayMembers" :key="member.user_id">
                <div class="avatar-wrapper">
                    <img :src="getAvatarUrl(userStore.getUser(member.user_id)?.avatar) || DeFaultImage" 
                    alt="" 
                    class="avatar"/>
                    <div class="role-badge owner" v-if="member.role === ImTypes.GroupRole.GROUP_ROLE_OWNER">群主</div>
                    <div class="role-badge admin" v-else-if="member.role === ImTypes.GroupRole.GROUP_ROLE_ADMIN">管理
                    </div>
                </div>
                <div class="name" :title="member.nickname || member.user_id.toString()">
                    {{ member.user_id === userStore.getUserID() ? '我' : (member.nickname || userStore.getUser(member.user_id)?.user_name) }}
                </div>
            </div>
            <div class="member-item" @click="$emit('invite')" v-if="canInvite">
                <div class="invite-btn">+</div>
                <div class="name">邀请</div>
            </div>
            <div class="member-item" @click="$emit('remove')" v-if="canRemove">
                <div class="invite-btn remove">—</div>
                <div class="name">移除</div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ImTypes } from '@shared/types';
import { APP_CONSTANTS as config } from '@shared/config/constants';
import { useUserStore } from '@/src/store/user';
import DeFaultImage from '@/src/assets/avatar/default.png'

const userStore = useUserStore();

const props = withDefaults(defineProps<{
    members: ImTypes.GroupMember[];
    maxDisplay?: number;
    canInvite?: boolean;
}>(), {
    members: () => [],
    maxDisplay: 15,
    canInvite: true
});

defineEmits(['view-all', 'invite', 'remove', 'click-member']);

const getAvatarUrl = (url?: string) => {
    if (!url) return '';
    return url.startsWith('http') ? url : config.fileServer + url;
};

const currentUserMember = computed(() => {
    return props.members.find(member => member.user_id === userStore.getUserID());
});

const canRemove = computed(() => {
    if (!currentUserMember.value) return false;
    return currentUserMember.value.role === ImTypes.GroupRole.GROUP_ROLE_OWNER || 
           currentUserMember.value.role === ImTypes.GroupRole.GROUP_ROLE_ADMIN;
});

const sortedMembers = computed(() => {
    return [...props.members].sort((a, b) => {
        const getWeight = (role: ImTypes.GroupRole) => {
            if (role === ImTypes.GroupRole.GROUP_ROLE_OWNER) return 0;
            if (role === ImTypes.GroupRole.GROUP_ROLE_ADMIN) return 1;
            return 2;
        };
        return getWeight(a.role) - getWeight(b.role);
    });
});

const displayMembers = computed(() => {
    const buttonCount = (props.canInvite ? 1 : 0) + (canRemove.value ? 1 : 0);
    const maxMembers = 15 - buttonCount;
    return sortedMembers.value.slice(0, Math.min(props.maxDisplay, maxMembers));
});
</script>

<style scoped lang="scss">
@use "@/src/style/constant.scss" as *;

.group-members-card {
    background-color: var(--surface-subtle, #f8fafc);
    border: 1px solid var(--border-color, #e2e8f0);
    border-radius: var(--radius-lg, 12px);
    padding: 15px;
    margin-bottom: 20px;

    .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 15px;

        .title {
            font-size: 14px;
            font-weight: 600;
            color: $color-text-secondary;
        }

        .view-all {
            font-size: 13px;
            color: var(--el-color-primary, #409eff);
            cursor: pointer;
            display: flex;
            align-items: center;
            margin-right: -10px;

            &:hover {
                opacity: 0.8;
            }
        }
    }

    .members-grid {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 4px 2px;
        box-sizing: border-box;

        .member-item {
            display: flex;
            flex-direction: column;
            align-items: center;
            cursor: pointer;
            gap: 5px;
            width: 40px;

            &:hover .avatar-wrapper {
                opacity: 0.9;
            }

            .avatar-wrapper {
                position: relative;
                width: 32px;
                height: 32px;
                // margin-bottom: 5px;

                .avatar {
                    width: 100%;
                    height: 100%;
                    border-radius: 50%;
                    object-fit: cover;
                }

                .role-badge {
                    position: absolute;
                    bottom: -4px;
                    left: 50%;
                    transform: translateX(-50%);
                    font-size: 9px;
                    padding: 0 4px;
                    border-radius: 4px;
                    white-space: nowrap;
                    color: #fff;
                    transform-origin: center;
                    scale: 0.9;
                    z-index: 1;

                    &.owner {
                        background-color: #f59e0b;
                    }

                    &.admin {
                        background-color: #3b82f6;
                    }
                }
            }

            .name {
                width: 100%;
                font-size: 11px;
                color: $color-text-secondary;
                text-align: center;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
        }

        .invite-btn {
            cursor: pointer;
            border-radius: 50%;
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            background-color: $bg-hover;
            color: $color-text-secondary;
            border: 1px dashed $color-border;
            font-size: 20px;
            font-weight: 300;
            transition: all 0.2s ease;

            &:hover {
                background-color: $bg-active;
                color: $color-text-primary;
                border-color: $color-text-secondary;
            }

            &.remove {
                font-size: small;
                &:hover {
                    background-color: rgba(255, 77, 79, 0.08);
                    color: $color-error;
                    border-color: rgba(255, 77, 79, 0.4);
                }
            }
        }
    }
}
</style>
