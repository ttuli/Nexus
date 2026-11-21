<template>
    <div class="private-sidebar">
        <!-- Header -->
        <div class="sidebar-content scroll-bar-thin" v-if="friendInfo || userInfo">
            <!-- Profile Card -->
            <div class="profile-card">
                <div class="avatar-wrapper">
                    <Avatar :uid="targetId" type="user" width="68px" height="68px" class="profile-avatar" />
                </div>
                <h3 class="profile-name">{{ friendInfo?.remark || userInfo?.user_name || '未知用户' }}</h3>
                <div class="profile-id" v-if="friendInfo?.remark && userInfo?.user_name">
                    <span>用户名: {{ userInfo.user_name }}</span>
                </div>
                <div class="profile-id profile-account" v-if="targetId">
                    <span>账号: {{ targetId }}</span>
                    <el-tooltip content="复制账号" placement="top" :show-after="500">
                        <el-icon class="copy-icon" @click="copyAccount">
                            <CopyDocument />
                        </el-icon>
                    </el-tooltip>
                </div>
                <div class="profile-signature" v-if="userInfo?.personal_signature" :title="userInfo.personal_signature">
                    “{{ userInfo.personal_signature }}”
                </div>
            </div>

            <!-- Settings Group 1: Remark -->
            <div class="detail-group mt-15">
                <div class="detail-item remark-item">
                    <span class="label">备注</span>
                    <div class="value-wrapper" v-if="!isEditingRemark">
                        <span class="value">{{ friendInfo?.remark || '暂无备注' }}</span>
                        <el-icon class="edit-icon" @click="startEditRemark" v-if="friendInfo">
                            <Edit />
                        </el-icon>
                    </div>
                    <div class="edit-wrapper" v-else>
                        <el-input ref="remarkInputRef" v-model.trim="editRemarkValue" size="small" :maxlength="20"
                            placeholder="请输入备注" @blur="handleSaveRemark" @keyup.enter="handleSaveRemark" />
                    </div>
                </div>
            </div>

            <!-- Settings Group 2: Switches -->
            <div class="detail-group mt-15">
                <div class="detail-item action-toggle">
                    <span class="label">置顶聊天</span>
                    <CusSwitch :model-value="props.chat.is_top" :active-value="2" :inactive-value="1"
                        @change="handleUpdatePinned" />
                </div>
                <div class="detail-item action-toggle">
                    <span class="label">消息免打扰</span>
                    <CusSwitch :model-value="props.chat.is_disturb" :active-value="2" :inactive-value="1"
                        @change="handleUpdateDisturb" />
                </div>
            </div>

            <!-- Actions Section -->
            <div class="actions-section">
                <CusButton class="action-btn" type="normal" :show-icon="false" @click="clearChatData">
                    清除聊天记录
                </CusButton>
                <CusButton class="action-btn danger mt-15" type="normal" :show-icon="false" @click="confirmDeleteFriend">
                    删除好友
                </CusButton>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, nextTick } from 'vue';
import { useUserStore } from '@/src/store/user';
import { ImTypes } from '@shared/types';
import { extractTargetIdFromSessionId } from '@/src/utils/sessionUtils';
import { copyToClipboard } from '@/src/utils/clipboard';
import { CopyDocument, Edit } from '@element-plus/icons-vue';
import { useFriendActions } from '@/src/composables/useFriendActions';
import { updateSessionOptions, clearSessionMessages } from '@/src/composables/sessionActions';

const props = defineProps<{
    chat: ImTypes.Session;
}>();

const emit = defineEmits(['close']);

const userStore = useUserStore();
const { updateFriendRemark, deleteFriend } = useFriendActions();

const targetId = computed(() => extractTargetIdFromSessionId(props.chat.session_key, userStore.getUserID()) || 0);
const friendInfo = computed(() => userStore.getFriend(targetId.value));
const userInfo = computed(() => userStore.getUser(targetId.value));

const copyAccount = () => copyToClipboard(String(targetId.value), {
    successMsg: '已复制',
    errorMsg: '复制失败，请手动复制',
});

// Remark Editing Logic
const isEditingRemark = ref(false);
const editRemarkValue = ref('');
const remarkInputRef = ref();

const startEditRemark = () => {
    editRemarkValue.value = friendInfo.value?.remark || '';
    isEditingRemark.value = true;
    nextTick(() => {
        remarkInputRef.value?.focus();
    });
};

const handleSaveRemark = async () => {
    if (!isEditingRemark.value) return; // Prevent double trigger
    isEditingRemark.value = false;

    // Only save if changed
    if (editRemarkValue.value === (friendInfo.value?.remark || '')) return;
    if (!targetId.value || !friendInfo.value) return;

    try {
        await updateFriendRemark(targetId.value, editRemarkValue.value);
    } catch {
        // Error handled inside useFriendActions
    }
};

const debounce = (fn: Function, delay = 300) => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    return (...args: any[]) => {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            fn(...args);
        }, delay);
    };
};

const handleUpdatePinned = debounce(async (_val: string | number | boolean) => {
    try {
        await updateSessionOptions(props.chat.session_key, 3 - props.chat.is_top, undefined);
    } catch (error) {
        console.error(error);
    }
});

const handleUpdateDisturb = debounce(async (_val: string | number | boolean) => {
    try {
        await updateSessionOptions(props.chat.session_key, undefined, 3 - props.chat.is_disturb);
    } catch (error) {
        console.error(error);
    }
});

const clearChatData = () => {
    void clearSessionMessages(props.chat.session_key, () => emit('close'));
};

const confirmDeleteFriend = async () => {
    if (!targetId.value || !friendInfo.value) return;
    const ok = await deleteFriend(targetId.value, {
        friendName: userStore.getDisplayName(targetId.value) || String(targetId.value),
    });
    if (ok) emit('close');
};
</script>

<style scoped lang="scss">
.private-sidebar {
    height: 100%;
    display: flex;
    flex-direction: column;
    width: 100%;
    background-color: var(--bg-card);

    .sidebar-content {
        flex: 1;
        overflow-y: auto;
        padding: 20px;
        display: flex;
        flex-direction: column;

        .mt-15 {
            margin-top: 15px;
        }

        .profile-card {
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 0px 10px 24px 10px;
            border-bottom: 1px solid var(--border-color);
            margin-bottom: 10px;

            .avatar-wrapper {
                position: relative;
                border-radius: 50%;
                padding: 3px;
                background: linear-gradient(135deg, var(--color-primary-light), var(--color-primary));
                box-shadow: var(--shadow-sm);
                margin-bottom: 12px;
                display: inline-flex;
            }

            .profile-avatar {
                transition: transform 0.3s ease;
                cursor: pointer;

                &:hover {
                    transform: scale(1.05);
                }
            }

            .profile-name {
                font-size: 16px;
                font-weight: 600;
                color: var(--text-title);
                margin: 0;
            }

            .profile-id {
                font-size: 12px;
                color: var(--text-secondary);
                margin-top: 4px;
            }

            .profile-account {
                display: flex;
                align-items: center;
                gap: 4px;

                .copy-icon {
                    cursor: pointer;
                    font-size: 13px;
                    transition: color 0.2s;

                    &:hover {
                        color: var(--color-primary);
                    }
                }
            }

            .profile-signature {
                margin-top: 10px;
                font-size: 12px;
                color: var(--text-secondary);
                font-style: italic;
                text-align: center;
                max-width: 90%;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                padding: 4px 8px;
                background-color: var(--surface-subtle);
                border-radius: 6px;
            }
        }

        .detail-group {
            background-color: var(--surface-subtle);
            border: 1px solid var(--border-color);
            border-radius: var(--radius-lg);
            padding: 4px 14px;
            transition: border-color 0.2s, box-shadow 0.2s;

            .detail-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px 0;
                font-size: 14px;
                border-bottom: 1px solid var(--border-divider);

                &:last-child {
                    border-bottom: none;
                }

                &.action-toggle {
                    padding: 8px 0;
                }

                &.remark-item {
                    .value-wrapper {
                        display: flex;
                        align-items: center;
                        justify-content: flex-end;
                        flex: 1;
                        gap: 8px;
                        overflow: hidden;

                        .edit-icon {
                            cursor: pointer;
                            color: var(--text-secondary);
                            font-size: 14px;
                            transition: all 0.2s;

                            &:hover {
                                color: var(--color-primary);
                                transform: scale(1.15);
                            }
                        }
                    }

                    .edit-wrapper {
                        flex: 1;
                        display: flex;
                        justify-content: flex-end;

                        .el-input {
                            width: 150px;
                        }
                    }
                }

                .label {
                    color: var(--text-secondary);
                    flex-shrink: 0;
                    margin-right: 15px;
                }

                .value {
                    color: var(--text-primary);
                    text-align: right;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
            }
        }

        .actions-section {
            margin-top: 30px;
            display: flex;
            flex-direction: column;

            .action-btn {
                &.danger {
                    color: $color-error;
                    border-color: rgba($color-error, 0.2);

                    &:hover:not(:disabled) {
                        color: #ffffff;
                        border-color: $color-error;
                        background-color: $color-error;
                    }
                }
            }
        }
    }
}
</style>
