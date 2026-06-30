<template>
    <div class="sidebar">
        <div class="top-section">
            <Avatar :uid="userStore.getUserID()" @click.capture.stop="openUserInfo" />
            <div class="nav-item" :class="{ active: activeRoute.includes('chat') }" @click="navigateTo('chat')">
                <img :src="ChatIcon" alt="Chat" />
                <div v-if="chatBadge > 0" class="badge">{{ chatBadge > 99 ? '99+' : chatBadge }}</div>
            </div>
            <div class="nav-item" :class="{ active: activeRoute.includes('contacts') }" @click="navigateTo('contacts')">
                <img :src="ContactsIcon" alt="Contacts" />
                <div v-if="contactBadge > 0" class="badge">{{ contactBadge > 99 ? '99+' : contactBadge }}</div>
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
import { useAppStore } from '@/src/store/app';
import { useSessionStore } from '@/src/store/session';

import ChatIcon from '@/src/assets/sidebar/message.svg';
import ContactsIcon from '@/src/assets/menu/contacts.svg';
import SettingIcon from '@/src/assets/sidebar/setting.svg';
import { createWindow } from '@/src/utils/window';
import { windowService } from '@/src/services';
import { NotifySoundType } from '@/src/services/windowService';
import { CurrentRoute } from '@/src/types';

const router = useRouter();
const route = useRoute();
const userStore = useUserStore();
const appStore = useAppStore();

const activeRoute = computed(() => route.path);

const groupStore = useGroupStore();
const conversationStore = useSessionStore();

const contactBadge = computed(() => {
    return userStore.unreadPendingRequestCount + groupStore.unreadPendingRequestCount;
});

const chatBadge = computed(() => {
    return conversationStore.totalUnreadCount;
});

const navigateTo = (name: string) => {
    switch (name) {
        case 'chat':
            appStore.currentRoute = CurrentRoute.Chat
            break
        case 'contacts':
            appStore.currentRoute = CurrentRoute.Contacts
            break
    }
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
    background: rgba(236, 236, 236, 0.4);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: center;
    padding: 20px 0;
    -webkit-backdrop-filter: blur(20px);
    backdrop-filter: blur(20px);

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
            top: -4px;
            right: -4px;
            background-color: #ff4d4f;
            color: white;
            font-size: 10px;
            height: 22px;
            width: 22px;
            border-radius: 50%;
            text-align: center;
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
