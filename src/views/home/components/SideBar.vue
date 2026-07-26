<template>
    <div class="sidebar">
        <div class="top-section">
            <Avatar :uid="userStore.getUserID()" @click.capture.stop="openUserInfo" />
            <div class="nav-item" :class="{ active: activeRoute.includes('chat') }" @click="navigateTo('chat')">
                <MessageDots class="app-icon app-icon--lg" />
                <Badge :value="chatBadge" class="badge" />
            </div>
            <div class="nav-item" :class="{ active: activeRoute.includes('contacts') }" @click="navigateTo('contacts')">
                <AddressBook class="app-icon app-icon--lg" />
                <Badge :value="contactBadge" class="badge" />
            </div>

        </div>
        <div class="bottom-section">
            <div class="nav-item" @click="openSetting">
                <Setting class="app-icon app-icon--lg" />
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
import { MessageDots, AddressBook, Setting } from 'reicon-vue';
import { windowService } from '@/src/services';
import { NotifySoundType } from '@/src/services/windowService';
import { WindowKey } from '@shared/config/windowKeys';

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
    windowService.createWindow(WindowKey.Settings);
}
const openUserInfo = () => {
    windowService.createWindow(WindowKey.UserInfo);
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
    padding: 20px 0 10px 0;
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

        .app-icon {
            color: var(--text-secondary);
            transition: color 0.2s ease, opacity 0.2s ease;
        }

        &:hover,
        &:active {
            background-color: var(--bg-hover);

            .app-icon {
                color: var(--text-title);
            }
        }

        &.active {
            background-color: var(--color-primary);

            .app-icon {
                color: #ffffff !important;
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
