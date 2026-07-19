<template>
    <div class="sidebar">
        <div class="top-section">
            <Avatar :uid="userStore.getUserID()" @click.capture.stop="openUserInfo" />
            <div class="nav-item" :class="{ active: activeRoute.includes('chat') }" @click="navigateTo('chat')">
                <img :src="ChatIcon" alt="Chat" />
                <Badge :value="chatBadge" class="badge" />
            </div>
            <div class="nav-item" :class="{ active: activeRoute.includes('contacts') }" @click="navigateTo('contacts')">
                <img :src="ContactsIcon" alt="Contacts" />
                <Badge :value="contactBadge" class="badge" />
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
import { computed, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useUserStore } from '@/src/store/user';
import { useGroupStore } from '@/src/store/group';
import { useSessionStore } from '@/src/store/session';

import ChatIcon from '@/src/assets/sidebar/message.svg';
import ContactsIcon from '@/src/assets/menu/contacts.svg';
import SettingIcon from '@/src/assets/sidebar/setting.svg';
import { createWindow } from '@/src/utils/window';
import { windowService } from '@/src/services';
import { NotifySoundType } from '@/src/services/windowService';

const router = useRouter();
const route = useRoute();
const userStore = useUserStore();

const activeRoute = computed(() => route.path);

const groupStore = useGroupStore();
const sessionStore = useSessionStore();

const contactBadge = computed(() => {
    return userStore.unreadPendingRequestCount + groupStore.unreadPendingRequestCount;
});

const chatBadge = computed(() => {
    return sessionStore.totalUnreadCount;
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

watch(contactBadge, (newVal, oldVal) => {
    if (newVal > (oldVal || 0)) {
        windowService.playNotificationSound(NotifySoundType.Request);
    }
})
</script>

<style scoped lang="scss">
.sidebar {
    width: 60px;
    flex-shrink: 0;
    background: var(--bg-sidebar);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: center;
    padding: 20px 0;
    -webkit-backdrop-filter: var(--sidebar-blur);
    backdrop-filter: var(--sidebar-blur);

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
            filter: var(--icon-filter);
        }

        &:hover {
            background-color: var(--bg-hover);

            img {
                opacity: 0.8;
            }
        }

        &.active {
            background-color: var(--color-primary);

            img {
                opacity: 1;
                filter: brightness(0) invert(1); // Make icon white
            }
        }

        .badge {
            position: absolute;
            top: -4px;
            right: -4px;
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
