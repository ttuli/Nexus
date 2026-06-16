<template>
    <div class="main-container" @mousemove="handleMouseMove" @mouseup="handleMouseUp" @mouseleave="handleMouseUp">
        <SideBar />

        <!-- Left Pane -->
        <div class="left-pane" :style="{ width: leftWidth + 'px' }">
            <FilterColumn class="filter-column" @menu-select="handleMenuSelect" />
            <div class="sidebar-container">
                <router-view name="list" v-slot="{ Component }">
                    <keep-alive include="ChatList,ContactSidebar">
                        <component :is="Component" />
                    </keep-alive>
                </router-view>
            </div>
        </div>

        <!-- Resizer -->
        <div class="resizer" @mousedown="handleMouseDown"></div>

        <!-- Right Pane -->
        <div class="right-pane">
            
            <div class="content-container">
                <router-view v-slot="{ Component }">
                    <keep-alive include="BlankPage">
                        <component :is="Component" />
                    </keep-alive>
                </router-view>
            </div>
            <TitleBar :needMax="true" class="title-bar" />
        </div>

        <!-- Create ImTypes.GroupInfo Modal -->
        <CreateGroup :visible="createGroupVisible" @close="createGroupVisible = false" @create="handleCreateGroup" />
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import SideBar from './components/SideBar.vue';
import { windowService, ipcService, websocketService } from '@/src/services';
import { signalWindowReady } from '@/src/utils/windowReady';
import { useUserStore } from '@/src/store/user';
import { useChatStore } from '@/src/store/chat';
import FilterColumn from '@/src/components/FilterColumn.vue';
import CreateGroup from '@/src/components/CreateGroup.vue';
import { createWindow } from '@/src/utils/window';
import { groupService } from '@/src/services'
import { IpcChannels, ApiTypes } from '@/src/types';
import { initRelationStore, storeOfflineTimestamp } from '@/src/store/init';
import { ElMessage } from 'element-plus';
import GlobalLoading from '@/src/components/GlobalLoading/GlobalLoading';
import messageService from '@/src/services/messageService';

const router = useRouter();
const userStore = useUserStore()
const chatStore = useChatStore()

const leftWidth = ref(250);
const isResizing = ref(false);

const handleMouseDown = () => {
    isResizing.value = true;
};

const handleMouseMove = (e: MouseEvent) => {
    if (!isResizing.value) return;

    // 鼠标在 context-menu 上时不处理 resize，避免冲突
    const target = e.target as HTMLElement;
    if (target.closest('.context-menu')) return;

    // Limits
    const minWidth = 200;
    const maxWidth = 300;
    const sidebarWidth = 60;

    let newWidth = e.clientX - sidebarWidth;
    if (newWidth < minWidth) newWidth = minWidth;
    if (newWidth > maxWidth) newWidth = maxWidth;

    leftWidth.value = newWidth;
};

const handleMouseUp = () => {
    isResizing.value = false;
};

// Menu selection handling
const createGroupVisible = ref(false);

const handleCreateGroup = async (data: { name: string; userIds: number[] }) => {
    GlobalLoading.show("创建中...")
    try {
        await groupService.createGroup({
            name: data.name,
            avatar: '',
            member_ids: data.userIds
        } as ApiTypes.group.CreateGroupReq)
        ElMessage.success('创建成功')
    } finally {
        GlobalLoading.close()
    }
}

const handleMenuSelect = (key: string) => {
    if (key === 'search') {
        createWindow('addFriend');
    } else if (key === 'createGroup') {
        createGroupVisible.value = true;
    }
};

onMounted(async () => {
    ipcService.on(IpcChannels.ROUTE_NAVIGATE, (_e, path) => {
        router.push(path);
    });
    await import('@/src/views/home/contact/components/ContactSidebar.vue')
    await import('@/src/components/BlankPage.vue')

    chatStore.loadFromStorage(userStore.getUserID());
    websocketService.connect()

    await initRelationStore()

    signalWindowReady()

    messageService.getOfflineActiveSessions()
});
onUnmounted(async () => {
    storeOfflineTimestamp()
    chatStore.saveToStorage(userStore.getUserID());
    ipcService.off(IpcChannels.ROUTE_NAVIGATE);
});
</script>

<style scoped lang="scss">
@use "@/src/style/_constant.scss" as *;

.main-container {
    position: fixed;
    display: flex;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    height: 100%;
    background-color: transparent;

    user-select: none; // Prevent selection during drag

    .left-pane {
        display: flex;
        flex-direction: column;
        flex-shrink: 0;
        background-color: $bg-list;
        border-right: 1px solid $color-border;
        position: relative;
        z-index: 2;

        .filter-column {
            flex-shrink: 0;
        }

        .sidebar-container {
            flex: 1;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            -webkit-app-region: no-drag;
        }
    }

    .resizer {
        width: 10px;
        cursor: col-resize;
        background-color: transparent;
        transition: background-color 0.2s;
        z-index: 10;
        margin-left: -5px;
        margin-right: -5px;
    }

    .right-pane {
        height: 100%;
        display: flex;
        flex-direction: column;
        width: 100%;
        background-color: $bg-body;
        position: relative;

        .title-bar {
            position: absolute;
            left: v-bind(leftWidth)px;
            background-color: transparent;
            height: 35px;
            flex-shrink: 0;
            z-index: 1;
        }

        .content-container {
            flex: 1 0;
            min-height: 0; // Critical for flex child overflow containment
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }
    }
}
</style>
