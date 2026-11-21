<template>
    <div class="group-list">
        <ContactCategorySection
            v-for="cat in visibleCategories"
            :key="cat.key"
            :title="cat.title"
            :count="cat.items.length"
            :expanded="isFiltering || expanded[cat.key]"
            @toggle="toggle(cat.key)"
        >
            <ContactItem
                v-for="group in cat.items"
                :key="group.id"
                :id="group.id"
                type="group"
                :name="group.name"
                :desc="getGroupDesc(group)"
                :active="isActive(group.id)"
                @click="handleSelect(group.id)"
            />
        </ContactCategorySection>

        <div v-if="isFiltering && totalMatched === 0" class="empty-tip">
            没有找到相关群聊
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useGroupStore } from '@/src/store/group';
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
const groupStore = useGroupStore();
const userStore = useUserStore();

const expanded = reactive({
    created: true,
    managed: false,
    joined: false
});

type CategoryKey = keyof typeof expanded;

const toggle = (key: CategoryKey) => {
    expanded[key] = !expanded[key];
};

const normalizedKeyword = computed(() => props.searchKeyword.trim().toLowerCase());
const isFiltering = computed(() => normalizedKeyword.value.length > 0);

const matchesGroup = (group: ImTypes.GroupInfo) => {
    const kw = normalizedKeyword.value;
    if (!kw) return true;
    return [group.name, String(group.id)].some(text => text && text.toLowerCase().includes(kw));
};

const allGroups = computed(() => Array.from(groupStore.groupMap.values()));

const createdGroups = computed(() =>
    allGroups.value.filter(g => g.owner_id === userStore.userID && matchesGroup(g))
);

const managedGroups = computed<ImTypes.GroupInfo[]>(() => []);

const joinedGroups = computed(() =>
    Array.from(groupStore.joinedGroupIds)
        .map(id => groupStore.groupMap.get(id))
        .filter((g): g is ImTypes.GroupInfo => !!g && g.owner_id !== userStore.userID && matchesGroup(g))
);

const categories = computed<Array<{ key: CategoryKey; title: string; items: ImTypes.GroupInfo[] }>>(() => [
    { key: 'created', title: '我创建的群聊', items: createdGroups.value },
    { key: 'managed', title: '我管理的群聊', items: managedGroups.value },
    { key: 'joined', title: '我加入的群聊', items: joinedGroups.value },
]);

const visibleCategories = computed(() =>
    categories.value.filter(cat => (!isFiltering.value || cat.items.length > 0))
);

const totalMatched = computed(() =>
    categories.value.reduce((sum, cat) => sum + cat.items.length, 0)
);

const getGroupDesc = (group: ImTypes.GroupInfo) => {
    if (group.notice?.trim()) return group.notice.trim();
    return group.member_count ? `${group.member_count}人` : '';
};

const isActive = (id: number) => {
    return route.path === '/home/contacts/group' && Number(route.query.id) === id;
};

const handleSelect = (id: number) => {
    router.push(`/home/contacts/group?id=${id}`);
};
</script>

<style scoped lang="scss">
.group-list {
    padding: 6px 0;
}

.empty-tip {
    padding: 32px 16px;
    text-align: center;
    color: $color-text-placeholder;
    font-size: 13px;
}
</style>
