<template>
    <div class="chat-sidebar-wrapper" :class="{ 'visible': visible }">
        <template v-if="chat">
            <PrivateChatSidebar v-if="chat.type === ImTypes.ConversationType.CONVERSATION_TYPE_PRIVATE" :chat="chat"
                @close="$emit('close')" />
            <GroupChatSidebar v-else-if="chat.type === ImTypes.ConversationType.CONVERSATION_TYPE_GROUP" :chat="chat"
                @close="$emit('close')" />
        </template>
    </div>
</template>

<script setup lang="ts">
import { ImTypes } from '@/types';
import PrivateChatSidebar from './PrivateChatSidebar.vue';
import GroupChatSidebar from './GroupChatSidebar.vue';

defineProps<{
    visible: boolean;
    chat: ImTypes.Conversation | null;
}>();

defineEmits(['close']);
</script>

<style scoped lang="scss">
@use "@/style/constant.scss" as *;

.chat-sidebar-wrapper {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 280px;
    background: #fff;
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
}
</style>
