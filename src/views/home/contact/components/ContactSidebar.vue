<template>
    <div class="contact-sidebar">
        <!-- Validation Button Area -->
        <div class="validation-entry" @click="goToValidation" :class="{ active: isValidationActive }">
            <div class="icon-box">
                <img :src="ValidationIcon" class="icon" />
                <div v-if="pendingCount > 0" class="badge">{{ pendingCount }}</div>
            </div>
            <div class="text">验证消息</div>
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
                <component :is="currentListComponent" />
            </KeepAlive>
        </div>
    </div>
</template>

<script lang="ts" setup>
import { ref, computed, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';

defineOptions({ name: 'ContactSidebar' });

import ValidationIcon from '@/assets/menu/contacts.svg';
import FriendList from './FriendList.vue';
import GroupList from './GroupList.vue';

import { useUserStore } from '@/store/user';

const router = useRouter();
const route = useRoute();
const userStore = useUserStore();

const currentTab = ref<'friend' | 'group'>('friend');
const lastReadTime = ref(Number(localStorage.getItem('validationLastReadTime') || 0));

const pendingCount = computed(() => {
    const requests = Array.from(userStore.friendRequestMap.values());

    return requests.filter(req => {
        if (req.handle_time) {
            return req.handle_time > lastReadTime.value;
        }

        return req.request_time > lastReadTime.value;
    }).length;
});

const isValidationActive = computed(() => route.path.includes('/contact/validation'));

const currentListComponent = computed(() => {
    return currentTab.value === 'friend' ? FriendList : GroupList;
});

const goToValidation = () => {
    // Clear badge on click
    lastReadTime.value = Date.now();
    localStorage.setItem('validationLastReadTime', lastReadTime.value.toString());

    router.push('/home/contacts/validation');
};

// Also clear if we match the route (e.g. refresh on page)
watch(() => route.path, (newPath) => {
    if (newPath.includes('/contact/validation')) {
        lastReadTime.value = Date.now();
        localStorage.setItem('validationLastReadTime', lastReadTime.value.toString());
    }
}, { immediate: true });
</script>

<style scoped lang="scss">
@use "@/style/_constant.scss" as *;

.contact-sidebar {
    height: 100%;
    display: flex;
    flex-direction: column;
    background-color: #fff;
    // border-right handled by layout
}

.validation-entry {
    display: flex;
    align-items: center;
    padding: 16px;
    cursor: pointer;
    transition: background-color 0.2s;
    border-bottom: 1px solid $color-border;

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

            .icon {
                filter: brightness(0) invert(1);
            }
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
        transition: all 0.2s;

        .icon {
            width: 24px;
            height: 24px;
            filter: brightness(0) invert(1); // Make it white usually
        }

        .badge {
            position: absolute;
            top: -6px;
            right: -6px;
            background-color: $color-error;
            color: white;
            font-size: 11px;
            height: 18px;
            width: 18px;
            border-radius: 50%;
            text-align: center;
            display: flex;
            justify-content: center;
            align-items: center;
        }
    }

    .text {
        font-size: 15px;
        color: $color-text-primary;
        font-weight: 400;
    }
}

.tabs {
    display: flex;
    padding: 12px 16px 0;
    gap: 20px;
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

        &.active {
            color: $color-primary;
            font-weight: 500;

            &::after {
                content: '';
                position: absolute;
                bottom: 0;
                left: 0;
                right: 0;
                height: 2px;
                background-color: $color-primary;
                border-radius: 2px 2px 0 0;
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
        background-color: rgba(0, 0, 0, 0.1);
        border-radius: 2px;
    }
}
</style>