<template>
    <div class="friend-list">
        <ContactCategorySection
            v-for="cat in visibleCategories"
            :key="cat.key"
            :title="cat.title"
            :count="cat.items.length"
            :expanded="isFiltering || expanded[cat.key]"
            @toggle="toggle(cat.key)"
        >
            <ContactItem
                v-for="friend in cat.items"
                :key="friend.friend_id"
                :id="friend.friend_id"
                :name="getPrimaryName(friend)"
                :sub-name="getSubName(friend)"
                :desc="getSignature(friend)"
                :active="isActive(friend.friend_id)"
                @click="handleSelect(friend.friend_id)"
            />
        </ContactCategorySection>

        <div v-if="isFiltering && totalMatched === 0" class="empty-tip">
            没有找到相关好友
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useUserStore } from '@/src/store/user';
import ContactCategorySection from './ContactCategorySection.vue';
import ContactItem from './ContactItem.vue';
import { ImTypes } from '@shared/types';

const props = withDefaults(defineProps<{
    searchKeyword?: string;
}>(), {
    searchKeyword: ''
});

const router = useRouter();
const route = useRoute();
const userStore = useUserStore();

const expanded = reactive({
    starred: true,
    normal: true,
    blocked: false,
});

type CategoryKey = keyof typeof expanded;

const toggle = (key: CategoryKey) => {
    expanded[key] = !expanded[key];
};

const getPrimaryName = (friend: ImTypes.Friend) => {
    return userStore.getDisplayName(friend.friend_id) || String(friend.friend_id);
};

const getSubName = (friend: ImTypes.Friend) => {
    if (!friend.remark) return '';
    const userName = userStore.getUser(friend.friend_id)?.user_name;
    return userName && userName !== friend.remark ? userName : '';
};

const getSignature = (friend: ImTypes.Friend) => {
    const sig = userStore.getUser(friend.friend_id)?.personal_signature?.trim();
    return sig || '暂无签名';
};

const normalizedKeyword = computed(() => props.searchKeyword.trim().toLowerCase());
const isFiltering = computed(() => normalizedKeyword.value.length > 0);

const matchesFriend = (friend: ImTypes.Friend) => {
    const kw = normalizedKeyword.value;
    if (!kw) return true;
    const user = userStore.getUser(friend.friend_id);
    const candidates = [friend.remark, user?.user_name, String(friend.friend_id)];
    return candidates.some(text => text && text.toLowerCase().includes(kw));
};

const sortByName = (list: ImTypes.Friend[]) => {
    return [...list].sort((a, b) => getPrimaryName(a).localeCompare(getPrimaryName(b), 'zh-CN'));
};

const filteredFriends = computed(() =>
    Array.from(userStore.friendMap.values()).filter(matchesFriend)
);

const categories = computed<Array<{ key: CategoryKey; title: string; items: ImTypes.Friend[]; hideWhenEmpty?: boolean }>>(() => [
    { key: 'starred', title: '星标好友', items: sortByName(filteredFriends.value.filter(f => f.starred && !f.blocked)) },
    { key: 'normal', title: '我的好友', items: sortByName(filteredFriends.value.filter(f => !f.starred && !f.blocked)) },
    { key: 'blocked', title: '黑名单', items: sortByName(filteredFriends.value.filter(f => f.blocked)), hideWhenEmpty: true },
]);

const visibleCategories = computed(() =>
    categories.value.filter(cat => (isFiltering.value || cat.hideWhenEmpty ? cat.items.length > 0 : true))
);

const totalMatched = computed(() =>
    categories.value.reduce((sum, cat) => sum + cat.items.length, 0)
);

const isActive = (id: number) => {
    return route.path === '/home/contacts/friend' && Number(route.query.uid) === id;
};

const handleSelect = (id: number) => {
    router.push(`/home/contacts/friend?uid=${id}`);
};
</script>

<style scoped lang="scss">
.friend-list {
    padding: 6px 0;
}

.empty-tip {
    padding: 32px 16px;
    text-align: center;
    color: $color-text-placeholder;
    font-size: 13px;
}
</style>
