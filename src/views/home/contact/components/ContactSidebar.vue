<template>
    <div class="contact-sidebar">
        <!-- Validation Button Area -->
        <div class="validation-entry" @click="goToValidation" :class="{ active: isValidationActive }">
            <div class="icon-box">
                <UserCheck class="app-icon app-icon--md" />
            </div>
            <div class="text">验证消息</div>
            <Badge :value="pendingCount" class="badge" />
        </div>

        <!-- Tabs -->
        <div class="tabs">
            <div class="tab-item" :class="{ active: currentTab === 'friend' }" @click="currentTab = 'friend'">
                好友
            </div>
            <div class="tab-item" :class="{ active: currentTab === 'group' }" @click="currentTab = 'group'">
                群聊
            </div>
        </div>

        <!-- List Content -->
        <div class="list-container">
            <KeepAlive>
                <component :is="currentListComponent" :search-keyword="searchKeyword" />
            </KeepAlive>
        </div>
    </div>
</template>

<script lang="ts" setup>
import { ref, computed, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';

defineOptions({ name: 'ContactSidebar' });

import { UserCheck } from 'reicon-vue';
import FriendList from './FriendList.vue';
import GroupList from './GroupList.vue';

import { useUserStore } from '@/src/store/user';
import { useGroupStore } from '@/src/store/group';

withDefaults(defineProps<{
    searchKeyword?: string;
}>(), {
    searchKeyword: ''
});

const emit = defineEmits<{
    (e: 'clear-search'): void;
}>();

const router = useRouter();
const route = useRoute();
const userStore = useUserStore();
const groupStore = useGroupStore();

const currentTab = ref<'friend' | 'group'>('friend');

// 切换「好友 / 群聊」Tab 时清空顶部搜索框
watch(currentTab, () => {
    emit('clear-search');
});

const pendingCount = computed(() => {
    return userStore.unreadPendingRequestCount + groupStore.unreadPendingRequestCount;
});

const isValidationActive = computed(() => route.path.includes('/contacts/validation'));

const currentListComponent = computed(() => {
    return currentTab.value === 'friend' ? FriendList : GroupList;
});

const goToValidation = () => {
    router.push('/home/contacts/validation');
};
</script>

<style scoped lang="scss">
.contact-sidebar {
    height: 100%;
    display: flex;
    flex-direction: column;
    background-color: $bg-list;
    // border-right handled by layout
}

.validation-entry {
    display: flex;
    align-items: center;
    margin: 4px 8px 8px;
    padding: 8px 10px;
    border-radius: 8px;
    cursor: pointer;
    transition: background-color 0.15s ease;
    position: relative;

    &:hover {
        background-color: $bg-hover;
    }

    &.active {
        background-color: $bg-active;

        .text {
            color: $color-primary;
            font-weight: 500;
        }

        .icon-box {
            background-color: $color-primary;
        }
    }

    .icon-box {
        width: 40px;
        height: 40px;
        background-color: $color-warning; // Distinct color for validation
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-right: 12px;
        position: relative;
        color: #ffffff;
        transition: background-color 0.2s ease;
    }

    .text {
        font-size: 14px;
        color: $color-text-primary;
        font-weight: 500;
        transition: color 0.15s ease;
    }

    .badge {
        position: absolute;
        top: 0;
        bottom: 0;
        right: 12px;
        margin: auto 0;
        width: 25px;
        height: 25px;
    }
}

.tabs {
    display: flex;
    padding: 8px 16px 0;
    gap: 24px;
    border-top: 1px solid $color-border;
    border-bottom: 1px solid $color-border;

    .tab-item {
        padding-bottom: 12px;
        font-size: 14px;
        color: $color-text-secondary;
        cursor: pointer;
        position: relative;
        transition: color 0.2s;

        &:hover {
            color: $color-text-primary;
        }

        &::after {
            content: '';
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            height: 2px;
            background-color: $color-primary;
            border-radius: 2px 2px 0 0;
            transform: scaleX(0);
            transform-origin: center;
            transition: transform 0.28s cubic-bezier(0.25, 1, 0.5, 1);
        }

        &.active {
            color: $color-primary;
            font-weight: 500;

            &::after {
                transform: scaleX(1);
            }
        }
    }
}

.list-container {
    flex: 1;
    overflow-y: auto;

    &::-webkit-scrollbar {
        width: 4px;
    }

    &::-webkit-scrollbar-thumb {
        background-color: var(--border-divider);
        border-radius: 2px;
    }
}
</style>