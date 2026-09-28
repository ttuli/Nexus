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

        <!-- Create Group Modal -->
        <UserSelectorModal
            :visible="createGroupVisible"
            title="创建群聊"
            confirm-text="创建"
            show-group-name-input
            @close="createGroupVisible = false"
            @submit="handleCreateGroup"
        />
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import SideBar from './components/SideBar.vue';
import { ipcService, websocketService, windowService, callService } from '@/src/services';
import { signalWindowReady } from '@/src/utils/window';
import { useSessionStore } from '@/src/store/session';
import { useMessageStore } from '@/src/store/message';
import UserSelectorModal from '@/src/components/UserSelectorModal.vue';
import { WindowKey } from '@shared/config/windowKeys';
import { useGroupActions } from '@/src/composables/useGroupActions'
import { IpcChannels, ApiTypes, ConnectionState } from '@shared/types';
import { initRelationStore, storeOfflineTimestamp } from '@/src/store/init';
import { ElMessage } from 'element-plus';
import GlobalLoading from '@/src/components/GlobalLoading';

import { useChatNavigation } from '@/src/composables/useChatNavigation';
import { generateGroupSessionId } from '@/src/utils/sessionUtils';
import { sessionService } from '@/src/services/sessionService';
import { syncOfflineActiveSessions, cancelOfflineSync } from '@/src/composables/offlineSync';
import { useUpdatePrompt } from '@/src/composables/useUpdatePrompt';

const router = useRouter();
const sessionStore = useSessionStore()
const messageStore = useMessageStore()
const { navigateToChat } = useChatNavigation();
useUpdatePrompt();

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
            navigateToChat(sessionId, { toggle: false });
        }
        
        ElMessage.success('创建成功')
    } finally {
        GlobalLoading.close()
    }
}

const handleMenuSelect = (key: string) => {
    if (key === 'search') {
        windowService.createWindow(WindowKey.AddFriend);
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
            void syncOfflineActiveSessions();
            // 闪断重连期间可能有来电：查一次是否仍在振铃。
            // 必须在渲染层触发——主进程一连上就推的话，通话监听可能还没挂载
            void callService.queryPending();
        }
    });

    websocketService.connect()

    // 会话列表来自本地 SQLite，快且是首屏必需；同时是后续两步的前置：
    // initRelationStore 要遍历 sessionList 收集对端 id，离线同步要比较本地 max_seq
    try {
        const sessions = await sessionService.loadAll();
        sessionStore.hydrateFromStorage(sessions as any);
    } catch (e) {
        console.error('[Home] load local sessions failed:', e);
    }

    // 本地数据就绪即显示窗口，不阻塞在远端资源上
    signalWindowReady()

    // 好友/群组等关系资源后台拉取：主进程有请求合并 + 双层缓存，
    // 消费端全部经 store 响应式读取、组件对缺失用户有按需补拉，无需 await
    void initRelationStore()

    void syncOfflineActiveSessions()

    // 冷启动补投：登录前对方可能已拨入且仍在振铃窗口内。
    // 服务端已复核主叫在线与剩余振铃时间，命中即由 wsCallListener 拉起接听界面
    void callService.queryPending()

    // 预热联系人面板的懒加载 chunk，首次切换 tab 不再等待加载
    void import('@/src/views/home/contact/components/ContactSidebar.vue');
    void import('@/src/views/home/contact/ValidationMessages.vue');
    void import('@/src/views/home/contact/FriendDetail.vue');
    void import('@/src/views/home/contact/GroupDetail.vue');
    void import('@/src/components/BlankPage.vue');
});
onUnmounted(() => {
    // 会话变更已在各自发生处即时落盘，退出无需再全量保存，此处仅做清理。
    // storeOfflineTimestamp 记录离线时刻，供下次上线的离线同步作为拉取起点。
    cancelOfflineSync()
    storeOfflineTimestamp()
    messageStore.clearMessageCache();
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
