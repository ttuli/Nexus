<template>
    <div class="section-card">
        <div class="section-header">
            <span class="title">群成员 ({{ totalCount }})</span>
        </div>
        <div class="member-grid">
            <div v-for="member in previewMembers" :key="member.user_id" class="member-item">
                <div class="avatar-wrapper">
                    <Avatar :uid="member.user_id" type="user" :width="'48px'" :height="'48px'" :radius="'50%'" />
                    <span v-if="member.role === ImTypes.GroupRole.GROUP_ROLE_OWNER" class="role-badge owner">群主</span>
                    <span v-else-if="member.role === ImTypes.GroupRole.GROUP_ROLE_ADMIN" class="role-badge admin">管理员</span>
                </div>
                <span class="member-name" :class="{
                    'is-owner': member.role === ImTypes.GroupRole.GROUP_ROLE_OWNER,
                    'is-admin': member.role === ImTypes.GroupRole.GROUP_ROLE_ADMIN
                }">{{ member.nickname || userStore.getUser(member.user_id)?.user_name }}</span>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import Avatar from '@/src/components/Avatar.vue';
import { ImTypes } from '@shared/types';
import { useUserStore } from '@/src/store/user';
import { userService } from '@/src/services';

const userStore = useUserStore();
const props = defineProps<{
    members: ImTypes.GroupMember[];
    totalCount: number;
    maxWidth?: number; // Max width in pixels
}>();

const previewMembers = computed(() => {
    if (!props.maxWidth) {
        return props.members.slice(0, 10);
    }
    // Calculate how many fit
    // Item width: 64px
    // Gap: 16px
    // Padding: 20px * 2 = 40px
    const itemWidth = 64;
    const gap = 16;
    const padding = 40;
    const availableWidth = props.maxWidth - padding;

    if (availableWidth <= 0) return [];

    // Formula: (n * itemWidth) + ((n - 1) * gap) <= availableWidth
    // n * itemWidth + n * gap - gap <= availableWidth
    // n * (itemWidth + gap) <= availableWidth + gap
    // n <= (availableWidth + gap) / (itemWidth + gap)

    const count = Math.floor((availableWidth + gap) / (itemWidth + gap));
    return props.members.slice(0, Math.max(0, count));
});

onMounted(() => {
    userService.fetchByIds(props.members.map(m => m.user_id));
});
</script>

<style scoped lang="scss">
@use "@/src/style/_constant.scss" as *;

.section-card {
    background: $bg-card;
    border-radius: 12px;
    padding: 20px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);

    .section-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;

        .title {
            font-size: 16px;
            font-weight: 600;
            color: $color-text-primary;
        }

        .more {
            font-size: 13px;
            color: $color-text-secondary;
            cursor: pointer;
            -webkit-app-region: no-drag;

            &:hover {
                color: $color-primary;
            }
        }
    }
}

.member-grid {
    display: flex;
    overflow-x: auto;
    gap: 16px;
    -webkit-app-region: no-drag;
    padding-bottom: 8px; // Space for scrollbar

    // Custom Scrollbar
    &::-webkit-scrollbar {
        height: 6px;
        background-color: transparent;
    }

    &::-webkit-scrollbar-thumb {
        background-color: transparent;
        border-radius: 4px;
    }

    &:hover::-webkit-scrollbar-thumb {
        background-color: var(--border-divider);
    }

    .member-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        cursor: pointer;
        flex-shrink: 0; // Prevent shrinking
        width: 64px; // Fixed width for consistency
        padding-top: 5px;

        .avatar-wrapper {
            position: relative;

            .role-badge {
                position: absolute;
                right: -4px;
                bottom: 0;
                font-size: 10px;
                padding: 2px 4px;
                border-radius: 4px;
                color: white;
                line-height: 1;
                transform: scale(0.9);
                box-shadow: 0 0 0 1px $bg-card;

                &.owner {
                    background-color: $color-owner;
                }

                &.admin {
                    background-color: $color-admin;
                }
            }
        }

        .member-name {
            font-size: 12px;
            color: $color-text-secondary;
            text-align: center;
            width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;

            &.is-owner {
                color: $color-owner;
            }

            &.is-admin {
                color: $color-admin;
            }
        }
    }
}
</style>
