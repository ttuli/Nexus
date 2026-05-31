<template>
    <div class="group-members-card">
        <div class="header">
            <span class="title">群成员 ({{ members.length }})</span>
            <span class="view-all" v-if="members.length > maxDisplay" @click="$emit('view-all')">
                查看全部 <el-icon><i class="el-icon-arrow-right"></i></el-icon>
            </span>
        </div>
        <div class="members-grid">
            <div class="member-item" v-for="member in displayMembers" :key="member.user_id">
                <div class="avatar-wrapper">
                    <img :src="getAvatarUrl(userStore.getUser(member.user_id)?.avatar)" alt="" class="avatar"
                        v-if="userStore.getUser(member.user_id)?.avatar" />
                    <div v-else class="avatar-placeholder">
                        {{ member.nickname?.charAt(0) || userStore.getUser(member.user_id)?.user_name?.charAt(0) ||
                            member.user_id.toString().charAt(0) }}
                    </div>
                    <div class="role-badge owner" v-if="member.role === ImTypes.GroupRole.GROUP_ROLE_OWNER">群主</div>
                    <div class="role-badge admin" v-else-if="member.role === ImTypes.GroupRole.GROUP_ROLE_ADMIN">管理
                    </div>
                </div>
                <div class="name" :title="member.nickname || member.user_id.toString()">
                    {{ member.nickname || member.user_id }}
                </div>
            </div>
            <div class="member-item add-btn" @click="$emit('invite')" v-if="canInvite">
                <div class="avatar-placeholder invite">
                    +
                </div>
                <div class="name">邀请</div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ImTypes } from '@/types';
import { APP_CONSTANTS as config } from '@/config/constants';
import { useUserStore } from '@/store/user';

const userStore = useUserStore();

const props = withDefaults(defineProps<{
    members: ImTypes.GroupMember[];
    maxDisplay?: number;
    canInvite?: boolean;
}>(), {
    members: () => [],
    maxDisplay: 14,
    canInvite: true
});

defineEmits(['view-all', 'invite', 'click-member']);

const displayMembers = computed(() => {
    return props.members.slice(0, props.maxDisplay);
});

const getAvatarUrl = (url?: string) => {
    if (!url) return '';
    return url.startsWith('http') ? url : config.fileServer + url;
};
</script>

<style scoped lang="scss">
@use "@/style/constant.scss" as *;

.group-members-card {
    background-color: #f9fafb;
    border-radius: 8px;
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

            &:hover {
                opacity: 0.8;
            }
        }
    }

    .members-grid {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 12px 8px;

        .member-item {
            display: flex;
            flex-direction: column;
            align-items: center;
            cursor: pointer;

            &:hover .avatar-wrapper {
                opacity: 0.9;
            }

            .avatar-wrapper {
                position: relative;
                width: 40px;
                height: 40px;
                margin-bottom: 5px;

                .avatar,
                .avatar-placeholder {
                    width: 100%;
                    height: 100%;
                    border-radius: 8px;
                    object-fit: cover;
                }

                .avatar-placeholder {
                    background: #e2e8f0;
                    color: #64748b;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 14px;
                    font-weight: 600;

                    &.invite {
                        background: transparent;
                        border: 1px dashed #cbd5e1;
                        color: #94a3b8;
                        font-size: 20px;
                        font-weight: 300;
                    }
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
    }
}
</style>
