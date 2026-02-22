<template>
    <div class="infos-entry">
        <!-- Display Other User Info -->
        <UserInfoDisplay v-if="targetUserId && targetUserId !== myId" :userId="targetUserId" :show-back="false" />

        <!-- Display ImTypes.GroupInfo Info -->
        <GroupInfoDisplay v-else-if="targetGroupId" :groupId="targetGroupId" :show-back="false" />

        <!-- Display My Info (Default) -->
        <InfoLayout v-else>
            <BaseUserInfo />
        </InfoLayout>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useUserStore } from '@/store/user';
import InfoLayout from './layout/InfoLayout.vue';
import BaseUserInfo from './components/BaseUserInfo.vue';
import UserInfoDisplay from './components/UserInfoDisplay.vue';
import GroupInfoDisplay from './components/GroupInfoDisplay.vue';

const route = useRoute();
const userStore = useUserStore();

const targetUserId = computed(() => {
    const uid = route.query.uid;
    return uid ? Number(uid) : null;
});

const targetGroupId = computed(() => {
    const gid = route.query.gid;
    return gid ? Number(gid) : null;
});

const myId = computed(() => userStore.userID);

</script>

<style scoped>
.infos-entry {
    width: 100%;
    height: 100%;
    overflow: hidden;
}
</style>
