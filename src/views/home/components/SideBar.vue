<template>
    <div class="sidebar">
        <div class="top-section">
            <Avatar :uid="userStore.getUserID()" @click.capture.stop="openUserInfo" />
            <div class="nav-item" :class="{ active: activeRoute.includes('chat') }" @click="navigateTo('chat')">
                <img :src="ChatIcon" alt="Chat" />
            </div>
            <div class="nav-item" :class="{ active: activeRoute.includes('contacts') }" @click="navigateTo('contacts')">
                <img :src="ContactsIcon" alt="Contacts" />
                <div v-if="contactBadge > 0" class="badge">{{ contactBadge }}</div>
            </div>

        </div>
        <div class="bottom-section">
            <div class="nav-item" @click="openSetting">
                <img :src="SettingIcon" alt="Setting" />
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useUserStore } from '@/store/user';

import { ImTypes } from '@/types';
import ChatIcon from '@/assets/view/message.svg?url';
import ContactsIcon from '@/assets/input/input_name.svg?url';
import SettingIcon from '@/assets/view/setting.svg?url';
import { createWindow } from '@/utils/window';

const router = useRouter();
const route = useRoute();
const userStore = useUserStore();

const activeRoute = computed(() => route.path);

// Sync with ContactSidebar logic
const lastReadTime = ref(Number(localStorage.getItem('validationLastReadTime') || 0));

// Listen for storage changes to sync badge clearing across components
window.addEventListener('storage', (e) => {
    if (e.key === 'validationLastReadTime') {
        lastReadTime.value = Number(e.newValue);
    }
});

// Also hook into route changes to update if we navigated to validation
router.afterEach((to) => {
    if (to.path.includes('/contact/validation')) {
        lastReadTime.value = Date.now();
    }
    // Refresh value from storage just in case
    lastReadTime.value = Number(localStorage.getItem('validationLastReadTime') || 0);
});

const contactBadge = computed(() => {
    const userId = userStore.userID;
    const requests = Array.from(userStore.friendRequestMap.values());

    return requests.filter(req => {
        return req.status === ImTypes.ApplyStatus.APPLY_STATUS_PENDING &&
            req.to_user_id === userId &&
            req.request_time > lastReadTime.value;
    }).length;
});

const navigateTo = (name: string) => {
    router.push(`/home/${name}`);
};
const openSetting = () => {
    createWindow('settings');
}
const openUserInfo = () => {
    createWindow('userInfo');
}

</script>

<style scoped lang="scss">
.sidebar {
    width: 60px;
    flex-shrink: 0;
    background-color: #f5f5f5; // Replace with variable if available
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: center;
    padding: 20px 0;
    border-right: 1px solid #e0e0e0;
    z-index: 2;

    .top-section,
    .bottom-section {
        display: flex;
        flex-direction: column;
        gap: 20px;
        align-items: center;
        width: 100%;
    }

    .nav-item {
        position: relative;
        width: 40px;
        height: 40px;
        border-radius: 8px;
        display: flex;
        justify-content: center;
        align-items: center;
        cursor: pointer;
        transition: all 0.3s ease;
        -webkit-app-region: no-drag;

        img {
            width: 24px;
            height: 24px;
            opacity: 0.6;
            transition: opacity 0.3s;
        }

        &:hover {
            background-color: #e0e0e0;

            img {
                opacity: 0.8;
            }
        }

        &.active {
            background-color: #007bff; // Primary color

            img {
                opacity: 1;
                filter: brightness(0) invert(1); // Make icon white
            }
        }

        .badge {
            position: absolute;
            top: 4px;
            right: 4px;
            background-color: #ff4d4f;
            color: white;
            font-size: 10px;
            height: 14px;
            min-width: 14px;
            padding: 0 4px;
            line-height: 14px;
            border-radius: 7px;
            text-align: center;
            border: 1px solid #fff;
            display: flex;
            justify-content: center;
            align-items: center;
        }
    }

    .setting-btn {
        border-radius: 12px;
        overflow: hidden;

        &.active {
            border: 2px solid #007bff;
            background-color: transparent;
        }

        .avatar-img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            opacity: 1;
        }

        &:hover .avatar-img {
            opacity: 1;
        }
    }
}
</style>
