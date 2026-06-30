<template>
    <ModalBackground :visible="visible" @close="handleClose">
        <div class="create-group-container">
            <div class="modal-header">
                <h3>创建群聊</h3>
            </div>

            <div class="modal-body">
                <!-- ImTypes.GroupInfo Name Input -->
                <div class="form-group">
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

                <!-- User List -->
                <div class="user-list-container">
                    <div v-if="loading" class="loading-state">
                        加载中...
                    </div>
                    <div v-else-if="displayUsers.length === 0" class="empty-state">
                        暂无用户
                    </div>
                    <div v-else class="user-list">
                        <div v-for="user in displayUsers" :key="user.id" class="user-item"
                            @click="toggleSelection(user.id)">
                            <div class="checkbox" :class="{ checked: selectedUsers.has(user.id) }">
                                <img v-if="selectedUsers.has(user.id)" :src="CheckIcon" class="check-icon" />
                            </div>
                            <img :src="user.avatar || DefaultAvatar" class="avatar" />
                            <div class="user-info">
                                <span class="name">{{ user.name }}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="modal-footer">
                <button class="btn cancel-btn" @click="handleClose">取消</button>
                <button class="btn create-btn" :disabled="!isValid" @click="handleCreate">
                    创建
                </button>
            </div>
        </div>
    </ModalBackground>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import ModalBackground from '@/src/components/ModalBackground/ModalBackground.vue';
import { useSessionStore } from '@/src/store/session';
import { useUserStore } from '@/src/store/user';
import { userService } from '@/src/services';
import { extractTargetIdFromSessionId } from '@/src/utils/sessionUtils';
import { ImTypes } from '@/src/types'
import DefaultAvatar from '@/src/assets/avatar/default.png?url';
import CheckIcon from '@/src/assets/common/check.svg?url';

const props = defineProps<{
    visible: boolean;
}>();

const emit = defineEmits<{
    (e: 'close'): void;
    (e: 'create', data: { name: string; userIds: number[] }): void;
}>();

const conversationStore = useSessionStore();
const userStore = useUserStore();

const groupName = ref('');
const source = ref<'chat' | 'friend'>('chat');
const selectedUsers = ref<Set<number>>(new Set());
const loading = ref(false);
const chatUserIds = ref<number[]>([]);
const friendUserIds = ref<number[]>([]);

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

const isValid = computed(() => {
    return groupName.value.trim().length > 0;
});

const handleClose = () => {
    emit('close');
    // Reset state on close logic if needed, or watcher will handle it
};

const handleCreate = () => {
    if (!isValid.value) return;
    emit('create', {
        name: groupName.value,
        userIds: Array.from(selectedUsers.value)
    });
    handleClose();
};

const toggleSelection = (userId: number) => {
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
            // Ensure info is loaded? Friends usually have basic info in ImTypes.Friend but might need ImTypes.UserInfo for avatar/name if not in ImTypes.Friend (ImTypes.Friend has remark).
            // ImTypes.Friend in store: { user_id, friend_id, remark, source, blocked, starred, create_time }
            // It does NOT have avatar/nickname. So we definitely need ImTypes.UserInfo.
            // The previous code fetched it.
            const friendDetails = await userService.fetchByIds(ids);
            userStore.setUsers(friendDetails);
            friendUserIds.value = ids;
        } else {
            friendUserIds.value = [];
        }

        // 2. Load Chat List Users (Private Chats)
        const privateChats = conversationStore.sessionList.filter(c => c.type === ImTypes.ConversationType.CONVERSATION_TYPE_PRIVATE);
        if (privateChats.length > 0) {
            const ids = privateChats.map(c => extractTargetIdFromSessionId(c.conversation_id, userStore.getUserID())).filter((id): id is number => id !== null); // Fix: Use targetId for private chat user ID
            // Ensure we have user info for these IDs
            const users = await userService.fetchByIds(ids);
            // Update relation store or local cache if needed, but here we just need to display.
            // Actually simplest is to just push to relationStore so we can use getUser
            userStore.setUsers(users);
            chatUserIds.value = ids;
        } else {
            chatUserIds.value = [];
        }

    } catch (error) {
        console.error('Failed to load users for create group', error);
    } finally {
        loading.value = false;
    }
};

watch(() => props.visible, (val) => {
    if (val) {
        groupName.value = '';
        selectedUsers.value.clear();
        source.value = 'chat';
        loadData();
    }
});

</script>

<style lang="scss" scoped>
// Use your project's variables here if available
$primary-color: #3370ff;
$bg-color: #ffffff;
$text-color: #333333;
$border-color: #e5e6eb;

.create-group-container {
    width: 400px;
    background: $bg-color;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.1);
    display: flex;
    flex-direction: column;
    max-height: 80vh;
}

.modal-header {
    padding: 16px 20px;
    border-bottom: 1px solid $border-color;

    h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        color: $text-color;
    }
}

.modal-body {
    padding: 20px;
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: 20px;
}

.form-group {
    display: flex;
    flex-direction: column;
    gap: 8px;

    label {
        font-size: 14px;
        color: #666;
    }

    .input-wrapper {
        background: #f5f6f7;
        border-radius: 6px;
        padding: 8px 12px;

        .group-name-input {
            width: 100%;
            border: none;
            background: transparent;
            outline: none;
            font-size: 14px;
            color: $text-color;
        }
    }
}

.source-selector {
    display: flex;
    border-bottom: 1px solid $border-color;

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

.user-list-container {
    flex: 1;
    overflow-y: auto;
    min-height: 200px;
    border: 1px solid $border-color;
    border-radius: 6px;

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

                .check-icon {
                    width: 12px;
                    height: 12px;
                    filter: brightness(0) invert(1); // Make it white
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

                .name {
                    font-size: 14px;
                    color: $text-color;
                    display: block;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
            }
        }
    }
}

.modal-footer {
    padding: 16px 20px;
    border-top: 1px solid $border-color;
    display: flex;
    justify-content: flex-end;
    gap: 12px;

    .btn {
        padding: 8px 20px;
        border-radius: 6px;
        font-size: 14px;
        cursor: pointer;
        border: none;
        transition: all 0.2s;

        &.cancel-btn {
            background: #f2f3f5;
            color: #4e5969;

            &:hover {
                background: #e5e6eb;
            }
        }

        &.create-btn {
            background: $primary-color;
            color: white;

            &:hover {
                opacity: 0.9;
            }

            &:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
        }
    }
}
</style>
