<template>
    <div class="main-container" @mousemove="handleMouseMove" @mouseup="handleMouseUp" @mouseleave="handleMouseUp">
        <SideBar />

        <!-- Left Pane -->
        <div class="left-pane" :style="{ width: leftWidth + 'px' }">
            <FilterColumn class="filter-column" @menu-select="handleMenuSelect" />
            <div class="sidebar-container">
                <router-view name="list" v-slot="{ Component }">
                    <keep-alive include="SessionList,ContactSidebar">
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
                    <keep-alive include="BlankPage,FriendDetail,GroupDetail,ValidationMessages,SessionContent">
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
import { ref, onMounted, onUnmounted, toRaw } from 'vue';
import { useRouter } from 'vue-router';
import SideBar from './components/SideBar.vue';
import { ipcService, websocketService } from '@/src/services';
import { signalWindowReady } from '@/src/utils/window';
import { useSessionStore } from '@/src/store/session';
import FilterColumn from '@/src/components/FilterColumn.vue';
import CreateGroup from '@/src/components/CreateGroup.vue';
import { createWindow } from '@/src/utils/window';
import { useGroupActions } from '@/src/composables/useGroupActions'
import { IpcChannels, ApiTypes, ConnectionState } from '@shared/types';
import { initRelationStore, storeOfflineTimestamp } from '@/src/store/init';
import { ElMessage } from 'element-plus';
import GlobalLoading from '@/src/components/GlobalLoading';

import { useChatNavigation } from '@/src/composables/useChatNavigation';
import { generateGroupSessionId } from '@/src/utils/sessionUtils';
import { sessionService } from '@/src/services/sessionService';
import { chatService } from '@/src/services/chatService';

const router = useRouter();
const sessionStore = useSessionStore()
const { navigateToChat } = useChatNavigation();

const leftWidth = ref(250);
const isResizing = ref(false);
const { createGroup } = useGroupActions();

const handleMouseDown = () => {
    isResizing.value = true;
};

const handleMouseMove = (e: MouseEvent) => {
    if (!isResizing.value) return;

    // 榧犳爣鍦?context-menu 涓婃椂涓嶅鐞?resize锛岄伩鍏嶅啿绐?
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
        const res = await createGroup({
            name: data.name,
            avatar: '',
            member_ids: data.userIds
        } as ApiTypes.group.CreateGroupReq)
        
        if (res?.data?.data) {
            const groupInfo = res.data.data as any;
            const sessionId = generateGroupSessionId(groupInfo.id);
            navigateToChat(sessionId);
        }
        
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

// WS 断线重连后触发离线同步：Lamport seq 下不再有逐条断层补拉，
// 断连期间"只存不推"的消息依赖重连时按会话 seq 对比增量拉齐
let wsWasDisconnected = false;

onMounted(async () => {
    ipcService.on(IpcChannels.ROUTE_NAVIGATE, (_e, path) => {
        router.push(path);
    });

    websocketService.onStateChange((state) => {
        if (state === ConnectionState.DISCONNECTED || state === ConnectionState.RECONNECTING) {
            wsWasDisconnected = true;
            return;
        }
        if (state === ConnectionState.CONNECTED && wsWasDisconnected) {
            wsWasDisconnected = false;
            void chatService.syncOfflineActiveSessions();
        }
    });

    void sessionService.loadAll().then((sessions) => {
        sessionStore.hydrateFromStorage(sessions as any);
    });
    websocketService.connect()

    await initRelationStore()

    signalWindowReady()

    chatService.syncOfflineActiveSessions()
});
onUnmounted(async () => {
    storeOfflineTimestamp()
    void sessionService.saveMany(
        sessionStore.sessionList.map((c) => ({
            ...toRaw(c),
            is_in_list: 1,
        }))
    );
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
