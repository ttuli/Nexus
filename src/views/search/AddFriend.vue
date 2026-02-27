<template>
    <div class="add-friend-container">
        <TitleBar class="title-bar" :needMax="false" :needMin="true" title="添加好友" />

        <div class="content-area">
            <!-- Search Header -->
            <div class="search-header">
                <div class="tab-switcher">
                    <div class="tab-item" :class="{ active: searchType === 'user' }" @click="searchType = 'user'">
                        找人
                    </div>
                    <div class="tab-item" :class="{ active: searchType === 'group' }" @click="searchType = 'group'">
                        找群
                    </div>
                </div>

                <div class="search-input-wrapper">
                    <CusInput v-model="keyword" :placeholder="searchType === 'user' ? '请输入手机号/账号/名字' : '请输入群号/群名称'"
                        @submit="startSearch">
                        <template #left-area>
                            <img :src="SearchIcon" class="search-icon" />
                        </template>
                        <template #right-area>
                            <button class="search-btn" @click="startSearch">搜索</button>
                        </template>
                    </CusInput>
                </div>

                <p class="search-tip">
                    {{ searchType === 'user' ? '通过手机号或账号精确查找' : '通过群号精确查找' }}
                </p>
            </div>

            <!-- Empty State (No search yet) -->
            <div v-if="!hasSearched" class="empty-state">
                <div class="illustration">🔍</div>
                <p>搜索好友，开启聊天之旅</p>
            </div>

            <!-- Results Area -->
            <div v-else class="results-area">
                <div class="result-list-wrapper">
                    <van-list v-model:loading="loading" :finished="finished" finished-text="没有更多了" @load="onLoad"
                        :immediate-check="false">
                        <template v-if="searchType === 'user'">
                            <UserCard v-for="user in (resultList as ImTypes.UserInfo[])" :key="user.user_id"
                                :user-info="user" :keyword="lastKeyword" @add="handleAddUser" />
                        </template>
                        <template v-else>
                            <GroupCard v-for="group in (resultList as ImTypes.GroupInfo[])" :key="group.id"
                                :group-info="group" :keyword="lastKeyword" @join="handleAddGroup" />
                        </template>
                    </van-list>

                    <!-- No Results -->
                    <div v-if="finished && resultList.length === 0" class="no-result">
                        暂无搜索结果
                    </div>
                </div>
            </div>
        </div>

        <!-- Add Friend Dialog -->
        <van-dialog v-model:show="showAddDialog" :title="searchType === 'user' ? '申请添加好友' : '申请加入群聊'" show-cancel-button
            @confirm="confirmAddFriend" width="320px">
            <!-- default slot for content -->
            <div class="dialog-content" v-if="targetUser || targetGroup">
                <div class="user-preview">
                    <Avatar :uid="targetUser ? targetUser.user_id : (targetGroup?.id || 0)"
                        :type="targetUser ? 'user' : 'group'" class="avatar" />
                    <div class="info">
                        <div class="name">{{ (targetUser ? targetUser.user_name : targetGroup?.name) || '未命名' }}</div>
                        <div class="sub-info">
                            <span>{{ targetUser ? '账号: ' + targetUser.user_id : '群号: ' + targetGroup?.id }}</span>
                            <template v-if="targetUser">
                                <img :src="maleIcon" class="gender-icon"
                                    v-if="targetUser.gender === ImTypes.Gender.GENDER_MALE" />
                                <img :src="femaleIcon" class="gender-icon"
                                    v-else-if="targetUser.gender === ImTypes.Gender.GENDER_FEMALE" />
                            </template>
                        </div>
                        <div class="sub-info" v-if="targetUser && targetUser.phone">手机: {{ targetUser.phone }}</div>
                    </div>
                </div>

                <div class="input-form">
                    <div class="label">验证信息</div>
                    <textarea v-model="applyMessage" class="msg-input" placeholder="请输入验证信息，例如：我是..."
                        rows="3"></textarea>
                </div>
            </div>
        </van-dialog>
    </div>
</template>

<script lang="ts" setup>
import { onMounted, ref, watch } from 'vue';
import { ImTypes } from '@/types';
import SearchIcon from '@/assets/input/search.svg?url';
import UserCard from './components/UserCard.vue';
import GroupCard from './components/GroupCard.vue';
import Avatar from '@/components/Avatar.vue';
import { UpdateAction, ResourceType } from '@/types';
import GlobalLoading from '@/components/GlobalLoading/GlobalLoading';
import { signalWindowReady } from '@/utils/windowReady';
import { userService, friendService, cacheService, groupService } from '@/services';
import { ElMessage } from 'element-plus';

import maleIcon from '@/assets/gender/male.svg?url';
import femaleIcon from '@/assets/gender/female.svg?url';

// Search State
const searchType = ref<'user' | 'group'>('user');
const searchMode = ref<ImTypes.ApplySource.APPLY_SOURCE_SEARCH_ACCOUNT | ImTypes.ApplySource.APPLY_SOURCE_SEARCH_PHONE | ImTypes.ApplySource.APPLY_SOURCE_SEARCH_NAME>(ImTypes.ApplySource.APPLY_SOURCE_SEARCH_NAME);
const keyword = ref('');
const hasSearched = ref(false);

// Pagination State
const resultList = ref<(ImTypes.UserInfo | ImTypes.GroupInfo)[]>([]);
const loading = ref(false);
const finished = ref(false);
const page = ref(1);
const pageSize = 20;

const lastKeyword = ref('');
const lastSearchType = ref('');

// Dialog State
const showAddDialog = ref(false);
const targetUser = ref<ImTypes.UserInfo | null>(null);
const targetGroup = ref<ImTypes.GroupInfo | null>(null);
const applyMessage = ref('');

// Reset state when switching types
watch(searchType, () => {
    keyword.value = '';
    hasSearched.value = false;
    resetSearch();
});

const resetSearch = () => {
    resultList.value = [];
    page.value = 1;
    finished.value = false;
    loading.value = false;
    lastKeyword.value = '';
};

// Start a fresh search
const startSearch = async () => {
    const currentKeyword = keyword.value.trim();
    if (!currentKeyword) return;

    // Reset list and pagination
    resultList.value = [];
    page.value = 1;
    finished.value = false;
    loading.value = true;
    hasSearched.value = true;

    lastKeyword.value = currentKeyword;
    lastSearchType.value = searchType.value;

    await onLoad();
};

// Load more data
const onLoad = async () => {
    if (finished.value && page.value !== 1) return;

    try {
        const offset = (page.value - 1) * pageSize;
        const currentKeyword = lastKeyword.value;

        let newItems: ImTypes.UserInfo[] | ImTypes.GroupInfo[] = [];

        if (searchType.value === 'user') {
            const isPhone = /^1[3-9]\d{9}$/.test(currentKeyword);
            const isUserId = /^\d{10}$/.test(currentKeyword);

            if (isPhone) {
                searchMode.value = ImTypes.ApplySource.APPLY_SOURCE_SEARCH_PHONE;
                if (page.value === 1) {
                    newItems = await userService.fetchByPhone(currentKeyword);
                    finished.value = true;
                }
            } else if (isUserId) {
                searchMode.value = ImTypes.ApplySource.APPLY_SOURCE_SEARCH_ACCOUNT;
                if (page.value === 1) {
                    newItems = await userService.fetchByIds([parseInt(currentKeyword)]);
                    finished.value = true;
                }
            } else {
                searchMode.value = ImTypes.ApplySource.APPLY_SOURCE_SEARCH_NAME;
                newItems = await userService.fetchByName(currentKeyword, pageSize, offset);

                if (newItems.length < pageSize) {
                    finished.value = true;
                } else {
                    page.value++;
                }
            }
        } else {
            const isGroupId = /^\d{8}$/.test(currentKeyword);
            if (isGroupId) {
                if (page.value === 1) {
                    newItems = await groupService.fetchByIds([parseInt(currentKeyword)]);
                    finished.value = true;
                    console.log(newItems);
                }
            } else {
                newItems = await groupService.fetchByName(currentKeyword, pageSize, offset);
                if (newItems.length < pageSize) {
                    finished.value = true;
                } else {
                    page.value++;
                }
            }
        }

        resultList.value.push(...newItems);
    } catch (error) {
        console.error('Search failed:', error);
        finished.value = true;
    } finally {
        loading.value = false;
    }
};
// Handle Add Click
const handleAddUser = async (user: ImTypes.UserInfo) => {
    targetUser.value = user;
    targetGroup.value = null;
    applyMessage.value = ''; // Reset for now
    showAddDialog.value = true;
};

const handleAddGroup = (group: ImTypes.GroupInfo) => {
    targetGroup.value = group;
    targetUser.value = null;
    applyMessage.value = '';
    showAddDialog.value = true;
};

// Confirm Add
const confirmAddFriend = async () => {
    if (!targetUser.value && !targetGroup.value) return;

    try {
        GlobalLoading.show('正在提交...');
        if (targetUser.value) {
            let res = await friendService.applyFriend({
                to_user_id: targetUser.value.user_id,
                apply_msg: applyMessage.value,
                source: searchMode.value
            });
            if (res.data.friend) {
                await cacheService.updateItems(UpdateAction.Add, ResourceType.FRIEND, [res.data.friend]);
                ElMessage.success("添加成功");
            } else if (res.data.data) {
                console.log(res.data)
                await cacheService.updateItems(UpdateAction.Add, ResourceType.FRIEND_REQUEST, [res.data.data]);
                ElMessage.success("发送好友申请成功");
            }
        } else if (targetGroup.value) {
            await groupService.joinGroup({
                group_id: targetGroup.value.id,
                message: applyMessage.value
            });
            
            ElMessage.success("发送入群申请成功");
        }
    } finally {
        GlobalLoading.close();
        showAddDialog.value = false;
    }
};
onMounted(async () => {
    signalWindowReady()

    await friendService.loadFriendListToStore()
    await friendService.loadPendingRequestsToStore()
    await groupService.fetchUserGroupIds()
})
</script>

<style lang="scss" scoped>
@use "@/style/_constant.scss" as *;

.add-friend-container {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    background-color: $bg-body;
    user-select: none;

    .title-bar {
        background-color: transparent;
        flex-shrink: 0;
    }

    .content-area {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: $spacing-xl; // Initial padding
        gap: $spacing-xl;
        overflow: hidden; // Contain scroll
    }

    .search-header {
        width: 100%;
        max-width: 480px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: $spacing-lg;
        flex-shrink: 0; // Don't shrink

        .tab-switcher {
            display: flex;
            background-color: $bg-card;
            border-radius: 8px;
            padding: 4px;
            gap: 4px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
            -webkit-app-region: no-drag;

            .tab-item {
                padding: 6px 24px;
                border-radius: 6px;
                font-size: $font-size-base;
                color: $color-text-secondary;
                cursor: pointer;
                transition: all $transition-base;

                &:hover {
                    color: $color-text-primary;
                }

                &.active {
                    background-color: $color-primary;
                    color: #fff;
                    font-weight: $font-weight-medium;
                    box-shadow: 0 2px 4px rgba($color-primary, 0.2);
                }
            }
        }

        .search-input-wrapper {
            width: 100%;
            background-color: transparent;
            border-radius: 12px;
            display: flex;
            align-items: center;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);

            -webkit-app-region: no-drag;

            .search-icon {
                width: 20px;
                height: 20px;
                opacity: 0.5;
                margin-left: 8px;
            }

            .search-btn {
                border: none;
                background: none;
                font-size: $font-size-base;
                color: $color-primary;
                font-weight: $font-weight-medium;
                cursor: pointer;
                padding: 0 12px;
                line-height: 1;
                border-left: 1px solid $color-border;
                margin-left: 4px;

                &:hover {
                    opacity: 0.8;
                }
            }
        }

        .search-tip {
            font-size: $font-size-sm;
            color: $color-text-secondary;
            margin: 0;
            opacity: 0.8;
        }
    }

    .empty-state {
        flex: 1;
        width: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: $color-text-placeholder;
        -webkit-app-region: drag;

        .illustration {
            font-size: 64px;
            margin-bottom: $spacing-md;
            opacity: 0.5;
        }
    }

    .results-area {
        flex: 1;
        width: 100%;
        max-width: 600px; // Limit width for list
        display: flex;
        flex-direction: column;
        overflow: hidden; // For scroll
        margin-top: -$spacing-md; // Pull up slightly
        -webkit-app-region: no-drag;

        .result-list-wrapper {
            flex: 1;
            overflow-y: auto;
            padding: $spacing-md;

            // Hide scrollbar but allow scroll
            &::-webkit-scrollbar {
                width: 6px;
            }

            &::-webkit-scrollbar-thumb {
                background-color: rgba(0, 0, 0, 0.1);
                border-radius: 3px;
            }

            .no-result {
                text-align: center;
                color: $color-text-secondary;
                margin-top: 40px;
            }
        }
    }
}

// Dialog Styles
.dialog-content {
    padding: $spacing-lg $spacing-xl;
    display: flex;
    flex-direction: column;
    gap: $spacing-lg;

    .user-preview {
        display: flex;
        align-items: center; // Align top for better info stacking? Center is fine.
        gap: $spacing-md;
        background-color: $bg-body;
        padding: $spacing-md;
        border-radius: 8px;

        .avatar {
            width: 56px;
            height: 56px;
            border-radius: 50%;
            object-fit: cover;
            border: 1px solid $color-border;
        }

        .info {
            display: flex;
            flex-direction: column;
            gap: 2px;
            flex: 1;
            min-width: 0;

            .name {
                font-size: $font-size-lg;
                font-weight: bold;
                color: $color-text-primary;
                @include ellipsis;
            }

            .sub-info {
                font-size: $font-size-sm;
                color: $color-text-secondary;
                display: flex;
                align-items: center;
                gap: 6px;

                .gender-icon {
                    width: 14px;
                    height: 14px;
                    object-fit: contain;
                }
            }
        }
    }

    .input-form {
        display: flex;
        flex-direction: column;
        gap: 8px;

        .label {
            font-size: $font-size-sm;
            color: $color-text-primary;
            font-weight: $font-weight-medium;
        }

        .msg-input {
            width: 100%;
            padding: 10px;
            border: 1px solid $color-border;
            border-radius: 8px;
            font-size: $font-size-sm;
            color: $color-text-primary;
            background-color: $bg-body;
            resize: none;
            outline: none;
            transition: all $transition-base;
            font-family: inherit;
            box-sizing: border-box;

            &:focus {
                border-color: $color-primary;
                box-shadow: 0 0 0 2px rgba($color-primary, 0.1);
            }

            &::placeholder {
                color: $color-text-placeholder;
            }
        }
    }
}
</style>
