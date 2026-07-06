<template>
    <div class="friend-list">
        <div v-if="sortedFriends.length === 0" class="empty-tip">
            暂无好友
        </div>
        <ContactItem v-for="friend in sortedFriends" :key="friend.friend_id" :id="friend.friend_id"
            :name="getFriendName(friend)" :active="isActive(friend.friend_id)"
            @click="handleSelect(friend.friend_id)" />
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useUserStore } from '@/src/store/user';
import ContactItem from './ContactItem.vue';
import { ImTypes } from '@shared/types';

const router = useRouter();
const route = useRoute();
const userStore = useUserStore();

const sortedFriends = computed(() => {
    // Sort logic (e.g. A-Z, Online status, etc.)
    // For now simple list
    return Array.from(userStore.friendMap.values());
});

const getFriendName = (friend: ImTypes.Friend) => {
    return friend.remark || userStore.getUser(friend.friend_id)?.user_name || String(friend.friend_id);
};

const isActive = (id: number) => {
    return route.path.includes(`/contact/friend?uid=${id}`);
};

const handleSelect = (id: number) => {
    router.push(`/home/contacts/friend?uid=${id}`);
};
</script>

<style scoped>
.friend-list {
    padding: 8px;
}

.empty-tip {
    padding: 24px;
    text-align: center;
    color: var(--text-secondary);
    font-size: 13px;
}
</style>
