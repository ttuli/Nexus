<template>
    <div class="group-list">
        <!-- Created Groups -->
        <div class="group-category">
            <div class="category-header" @click="toggle('created')">
                <span class="arrow" :class="{ expanded: expanded.created }">▶</span>
                <span class="title">我创建的群聊</span>
                <span class="count">{{ createdGroups.length }}</span>
            </div>
            <div v-show="expanded.created" class="category-content">
                <ContactItem v-for="group in createdGroups" :key="group.id" :id="group.id" type="group"
                    :name="group.name" :active="isActive(group.id)" @click="handleSelect(group.id)" />
            </div>
        </div>

        <!-- Managed Groups -->
        <div class="group-category">
            <div class="category-header" @click="toggle('managed')">
                <span class="arrow" :class="{ expanded: expanded.managed }">▶</span>
                <span class="title">我管理的群聊</span>
                <span class="count">{{ managedGroups.length }}</span>
            </div>
            <div v-show="expanded.managed" class="category-content">
                <ContactItem v-for="group in managedGroups" :key="group.id" :id="group.id" type="group"
                    :name="group.name" :active="isActive(group.id)" @click="handleSelect(group.id)" />
            </div>
        </div>

        <!-- Joined Groups -->
        <div class="group-category">
            <div class="category-header" @click="toggle('joined')">
                <span class="arrow" :class="{ expanded: expanded.joined }">▶</span>
                <span class="title">我加入的群聊</span>
                <span class="count">{{ joinedGroups.length }}</span>
            </div>
            <div v-show="expanded.joined" class="category-content">
                <ContactItem v-for="group in joinedGroups" :key="group.id" :id="group.id" type="group"
                    :name="group.name" :active="isActive(group.id)" @click="handleSelect(group.id)" />
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useGroupStore } from '@/store/group';
import { useUserStore } from '@/store/user';
import ContactItem from './ContactItem.vue';
import { ImTypes } from '@/types';

const router = useRouter();
const route = useRoute();
const groupStore = useGroupStore();
const userStore = useUserStore();

// Accordion state
const expanded = reactive({
    created: true,
    managed: false,
    joined: false
});

const toggle = (key: keyof typeof expanded) => {
    expanded[key] = !expanded[key];
};

const allGroups = computed(() => Array.from(groupStore.groupMap.values()));

const createdGroups = computed(() => {
    return allGroups.value.filter(g => g.owner_id === userStore.userID);
});

// Assuming we have admin logic, for now placeholder
const managedGroups = computed<ImTypes.GroupInfo[]>(() => {
    // Logic for admins would go here
    return [];
});

const joinedGroups = computed(() => {
    // Excluding created and managed
    return allGroups.value.filter(g => g.owner_id !== userStore.userID /* && !isAdmin */);
});

const isActive = (id: number) => {
    return route.path.includes(`/contact/group?id=${id}`);
};

const handleSelect = (id: number) => {
    router.push(`/home/contacts/group?id=${id}`);
};
</script>

<style scoped lang="scss">
@use "@/style/_constant.scss" as *;

.group-list {
    padding: 8px 0;
}

.category-header {
    display: flex;
    align-items: center;
    padding: 8px 16px;
    cursor: pointer;
    user-select: none;
    font-size: 13px;
    color: $color-text-secondary;

    &:hover {
        color: $color-text-primary;
    }

    .arrow {
        font-size: 10px;
        margin-right: 8px;
        transition: transform 0.2s;

        &.expanded {
            transform: rotate(90deg);
        }
    }

    .title {
        flex: 1;
        font-weight: 500;
    }

    .count {
        font-size: 12px;
        color: $color-text-placeholder;
    }
}

.category-content {
    padding: 0 8px;
}
</style>
