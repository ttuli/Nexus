<template>
    <SearchResultCard
        :uid="userInfo.user_id"
        avatar-type="user"
        :name="userInfo.user_name || '未命名'"
        :keyword="keyword"
        :highlighted="isMe"
    >
        <template #name-extra>
            <Male v-if="userInfo.gender === ImTypes.Gender.GENDER_MALE" class="gender-icon app-icon app-icon--xs" />
            <Female v-else-if="userInfo.gender === ImTypes.Gender.GENDER_FEMALE" class="gender-icon app-icon app-icon--xs" />
            <span v-if="isMe" class="me-tag">我</span>
        </template>

        <template #details>
            <div class="sub-info">
                <span class="label">账号:</span>
                <span class="value"><HighlightText :text="String(userInfo.user_id)" :keyword="keyword" /></span>
            </div>
            <div v-if="userInfo.phone" class="sub-info">
                <span class="label">手机:</span>
                <span class="value"><HighlightText :text="userInfo.phone" :keyword="keyword" /></span>
            </div>
        </template>

        <template #action>
            <template v-if="isMe" />
            <button v-else-if="status === 'added'" class="status-btn success" disabled>已添加</button>
            <button v-else-if="status === 'applying'" class="status-btn warning" disabled>等待验证</button>
            <button v-else class="action-btn" @click="$emit('add', userInfo)">添加好友</button>
        </template>
    </SearchResultCard>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { ImTypes } from '@shared/types';
import { useUserStore } from '@/src/store/user';
import { Male, Female } from 'reicon-vue';
import SearchResultCard from './SearchResultCard.vue';

const props = defineProps<{
    userInfo: ImTypes.UserInfo;
    keyword?: string;
}>();

defineEmits<{
    (e: 'add', user: ImTypes.UserInfo): void;
}>();

const userStore = useUserStore();
const isMe = computed(() => userStore.userID === props.userInfo.user_id);

const status = computed(() => {
    if (userStore.isFriend(props.userInfo.user_id)) return 'added';
    if (userStore.isFriendRequest(props.userInfo.user_id)) return 'applying';
    return 'none';
});
</script>

<style lang="scss" scoped>
.gender-icon {
    width: 14px;
    height: 14px;
}

.me-tag {
    font-size: 10px;
    background-color: $color-primary;
    color: white;
    padding: 0 4px;
    border-radius: 4px;
    height: 16px;
    line-height: 16px;
}
</style>
