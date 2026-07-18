<template>
    <CusModal :visible="visible" :title="title" width="400px" @close="handleClose">
        <!-- Group Name Input -->
        <div v-if="showGroupNameInput" class="form-group">
            <label>群聊名称</label>
            <div class="input-wrapper">
                <input v-model="groupName" type="text" placeholder="请输入群聊名称" class="group-name-input" />
            </div>
        </div>

        <!-- Source Selector -->
        <div class="source-selector">
            <div class="selector-item" :class="{ active: source === 'chat' }" @click="source = 'chat'">
                从聊天列表选择
            </div>
            <div class="selector-item" :class="{ active: source === 'friend' }" @click="source = 'friend'">
                从好友列表选择
            </div>
        </div>

        <!-- Search Bar -->
        <div class="search-bar-wrapper">
            <CusInput
                v-model="searchQuery"
                placeholder="搜索成员名称"
                class="search-input"
            >
                <template #left-area>
                    <img :src="SearchIcon" class="search-icon" />
                </template>
            </CusInput>
        </div>

        <!-- User List -->
        <div class="user-list-container">
            <div v-if="loading" class="loading-state">
                <CusSpinner text="加载中..." />
            </div>
            <div v-else-if="filteredUsers.length === 0" class="empty-state">
                暂无用户
            </div>
            <div v-else class="user-list">
                <div v-for="user in filteredUsers" :key="user.id" class="user-item"
                    :class="{ disabled: isExistingMember(user.id) }"
                    @click="toggleSelection(user.id)">
                    <div class="checkbox" :class="{ checked: isExistingMember(user.id) || selectedUsers.has(user.id), disabled: isExistingMember(user.id) }">
                        <img v-if="isExistingMember(user.id) || selectedUsers.has(user.id)" :src="CheckIcon" class="check-icon" />
                    </div>
                    <img :src="user.avatar || DefaultAvatar" class="avatar" />
                    <div class="user-info">
                        <span class="name" v-html="highlightName(user.name)"></span>
                        <span v-if="isExistingMember(user.id)" class="status-tag">已在群中</span>
                    </div>
                </div>
            </div>
        </div>

        <template #footer>
            <CusButton class="dialog-btn" type="normal" :show-icon="false" @click="handleClose">取消</CusButton>
            <CusButton class="dialog-btn" type="primary" :show-icon="false" :disabled="!isValid" :loading="submitLoading" @click="handleSubmit">
                {{ confirmText }}
            </CusButton>
        </template>
    </CusModal>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import CusModal from '@/src/components/CusModal.vue';
import CusSpinner from '@/src/components/CusSpinner.vue';
import CusButton from '@/src/components/CusButton.vue';
import CusInput from '@/src/components/CusInput.vue';
import { useSessionStore } from '@/src/store/session';
import { useUserStore } from '@/src/store/user';
import { userService } from '@/src/services';
import { extractTargetIdFromSessionId } from '@/src/utils/sessionUtils';
import { ImTypes } from '@shared/types';
import DefaultAvatar from '@/src/assets/avatar/default.png?url';
import CheckIcon from '@/src/assets/common/check.svg?url';
import SearchIcon from '@/src/assets/input/search.svg?url';

const props = withDefaults(defineProps<{
    visible: boolean;
    title: string;
    confirmText?: string;
    showGroupNameInput?: boolean;
    existingMemberIds?: number[];
    submitLoading?: boolean;
}>(), {
    confirmText: '确定',
    showGroupNameInput: false,
    existingMemberIds: () => [],
    submitLoading: false
});

const emit = defineEmits<{
    (e: 'close'): void;
    (e: 'submit', data: { name: string; userIds: number[] }): void;
}>();

const sessionStore = useSessionStore();
const userStore = useUserStore();

const groupName = ref('');
const searchQuery = ref('');
const source = ref<'chat' | 'friend'>('chat');
const selectedUsers = ref<Set<number>>(new Set());
const loading = ref(false);
const chatUserIds = ref<number[]>([]);
const friendUserIds = ref<number[]>([]);

const isExistingMember = (userId: number) => {
    return props.existingMemberIds.includes(userId);
};

// Helper to get display info
const getUserDisplayInfo = (userId: number) => {
    const user = userStore.getUser(userId);
    const friend = userStore.getFriend(userId);

    return {
        id: userId,
        name: friend?.remark || user?.user_name || user?.user_id.toString() || userId.toString(),
        avatar: user?.avatar || ''
    };
};

const displayUsers = computed(() => {
    const ids = source.value === 'chat' ? chatUserIds.value : friendUserIds.value;
    return ids.map(id => getUserDisplayInfo(id));
});

const filteredUsers = computed(() => {
    const q = searchQuery.value.trim().toLowerCase();
    if (!q) return displayUsers.value;
    return displayUsers.value.filter(user => user.name.toLowerCase().includes(q));
});

const highlightName = (name: string) => {
    const q = searchQuery.value.trim();
    if (!q) return name;
    const escapedQuery = q.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    const regex = new RegExp(`(${escapedQuery})`, 'gi');
    return name.replace(regex, '<span class="highlight">$1</span>');
};

const isValid = computed(() => {
    if (props.showGroupNameInput && groupName.value.trim().length === 0) {
        return false;
    }
    return selectedUsers.value.size > 0;
});

const handleClose = () => {
    emit('close');
};

const handleSubmit = () => {
    if (!isValid.value) return;
    emit('submit', {
        name: groupName.value,
        userIds: Array.from(selectedUsers.value)
    });
};

const toggleSelection = (userId: number) => {
    if (isExistingMember(userId)) return;
    if (selectedUsers.value.has(userId)) {
        selectedUsers.value.delete(userId);
    } else {
        selectedUsers.value.add(userId);
    }
};

const loadData = async () => {
    loading.value = true;
    try {
        // 1. Load Friend List
        const friends = userStore.friendList;
        if (friends.length > 0) {
            const ids = friends.map(f => f.friend_id);
            const friendDetails = await userService.fetchByIds(ids);
            userStore.setUsers(friendDetails);
            friendUserIds.value = ids;
        } else {
            friendUserIds.value = [];
        }

        // 2. Load Chat List Users (Private Chats)
        const privateChats = sessionStore.sessionList.filter(c => c.type === ImTypes.SessionType.SESSION_TYPE_PRIVATE);
        if (privateChats.length > 0) {
            const ids = privateChats.map(c => extractTargetIdFromSessionId(c.session_key, userStore.getUserID())).filter((id): id is number => id !== null);
            const users = await userService.fetchByIds(ids);
            userStore.setUsers(users);
            chatUserIds.value = ids;
        } else {
            chatUserIds.value = [];
        }

    } catch (error) {
        console.error('Failed to load users for selector', error);
    } finally {
        loading.value = false;
    }
};

watch(() => props.visible, (val) => {
    if (val) {
        groupName.value = '';
        searchQuery.value = '';
        selectedUsers.value.clear();
        source.value = 'chat';
        loadData();
    }
});

</script>

<style lang="scss" scoped>
@use "@/src/style/constant.scss" as *;

$primary-color: #3370ff;
$bg-color: #ffffff;
$text-color: #333333;
$border-color: #e5e6eb;

.form-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: flex-start;
    width: 100%;

    label {
        font-size: 14px;
        color: #666;
        user-select: none;
        -webkit-user-select: none;
    }

    .input-wrapper {
        width: 100%;
        background: #f5f6f7;
        border-radius: 6px;
        padding: 8px 12px;
        box-sizing: border-box;

        .group-name-input {
            width: 100%;
            border: none;
            background: transparent;
            outline: none;
            font-size: 14px;
            color: $text-color;
            padding: 0;
        }
    }
}

.source-selector {
    display: flex;
    border-bottom: 1px solid $border-color;
    width: 100%;
    margin-top: 15px;
    user-select: none;
    -webkit-user-select: none;

    .selector-item {
        flex: 1;
        text-align: center;
        padding: 10px 0;
        font-size: 14px;
        cursor: pointer;
        color: #666;
        position: relative;
        transition: color 0.2s;

        &.active {
            color: $primary-color;
            font-weight: 500;

            &::after {
                content: '';
                position: absolute;
                bottom: -1px;
                left: 0;
                width: 100%;
                height: 2px;
                background-color: $primary-color;
            }
        }
    }
}

.search-bar-wrapper {
    margin-top: 15px;
    width: 100%;

    :deep(.chat-input-wrapper) {
        height: 38px;
        padding-left: 12px;
        border-radius: 6px;

        .chat-input-field {
            font-size: 14px;
            padding: 8px 0;
        }
    }

    .search-icon {
        width: 16px;
        height: 16px;
        opacity: 0.5;
    }
}

.user-list-container {
    width: 100%;
    flex: 1;
    overflow-y: auto;
    min-height: 200px;
    border: 1px solid $border-color;
    border-radius: 6px;
    margin-top: 15px;
    box-sizing: border-box;
    user-select: none;
    -webkit-user-select: none;

    .loading-state,
    .empty-state {
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100%;
        color: #999;
        font-size: 14px;
    }

    .user-list {
        .user-item {
            display: flex;
            align-items: center;
            padding: 10px 12px;
            cursor: pointer;
            transition: background-color 0.2s;
            gap: 12px;

            &:hover {
                background-color: #f5f7fa;
            }

            &.disabled {
                cursor: not-allowed;
                opacity: 0.75;
                &:hover {
                    background-color: transparent;
                }
            }

            .checkbox {
                width: 18px;
                height: 18px;
                border: 1px solid #c9cdd4;
                border-radius: 4px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s;

                &.checked {
                    background-color: $primary-color;
                    border-color: $primary-color;
                }

                &.disabled {
                    background-color: #f3f4f6;
                    border-color: #e5e6eb;
                    cursor: not-allowed;
                }

                &.checked.disabled {
                    background-color: #e5e7eb;
                    border-color: #d1d5db;
                }

                .check-icon {
                    width: 12px;
                    height: 12px;
                    filter: brightness(0) invert(1);
                }
            }

            .avatar {
                width: 36px;
                height: 36px;
                border-radius: 50%;
                object-fit: cover;
            }

            .user-info {
                flex: 1;
                overflow: hidden;
                text-align: left;
                display: flex;
                align-items: center;
                justify-content: space-between;

                .name {
                    font-size: 14px;
                    color: $text-color;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;

                    :deep(.highlight) {
                        color: $primary-color;
                        font-weight: 600;
                    }
                }

                .status-tag {
                    font-size: 12px;
                    color: #999;
                    background-color: #f3f4f6;
                    padding: 2px 6px;
                    border-radius: 4px;
                    flex-shrink: 0;
                    margin-left: 8px;
                }
            }
        }
    }
}

.dialog-btn {
    width: 80px;
    user-select: none;
    -webkit-user-select: none;
}
</style>
