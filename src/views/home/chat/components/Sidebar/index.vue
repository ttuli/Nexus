<template>
    <div class="chat-sidebar-wrapper" :class="{ 'visible': visible }">
        <template v-if="chat">
            <PrivateSessionSidebar 
                v-if="chat.type === ImTypes.SessionType.SESSION_TYPE_PRIVATE" 
                :key="`private-${chat.session_id}`" 
                :chat="chat"
                @close="$emit('close')" />
            <GroupSessionSidebar 
                v-else-if="chat.type === ImTypes.SessionType.SESSION_TYPE_GROUP" 
                :key="`group-${chat.session_id}`" 
                :chat="chat"
                @close="$emit('close')" />
        </template>
        <div v-else class="sidebar-loading-container">
            <CusSpinner />
        </div>
    </div>
</template>

<script setup lang="ts">
import { ImTypes } from '@shared/types';
import PrivateSessionSidebar from '@/src/views/home/chat/components/Sidebar/PrivateSessionSidebar.vue';
import GroupSessionSidebar from '@/src/views/home/chat/components/Sidebar/GroupSessionSidebar.vue';

defineProps<{
    visible: boolean;
    chat: ImTypes.Session | null;
}>();
defineEmits(['close']);
</script>

<style scoped lang="scss">
.chat-sidebar-wrapper {
    position: absolute;
    // 上下各外扩 1px（由外层 content-wrapper 的 overflow: hidden 裁切），
    // 消除 Windows 缩放（125%/150%）下 transform 合成层在顶部产生的 1 物理像素缝隙
    top: -1px;
    right: 0;
    bottom: -1px;
    width: 280px;
    background: $bg-card;
    border-left: 1px solid $color-border;
    z-index: 100;
    overflow: hidden;

    // Animation
    transform: translateX(100%);
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);

    &.visible {
        transform: translateX(0);
        box-shadow: -5px 0 15px rgba(0, 0, 0, 0.05);
    }

    // Make sure inner sidebars take full height
    :deep(> div) {
        height: 100%;
        display: flex;
        flex-direction: column;
    }

    .sidebar-loading-container {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        width: 100%;
    }
}
</style>
