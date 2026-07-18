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
                <div class="detail-group action-group">
                    <div class="detail-item center-item text-primary" @click="clearChatData">
                        清除聊天记录
                    </div>
                </div>
                <div class="detail-group action-group mt-15">
                    <div class="detail-item center-item text-danger" @click="confirmDeleteFriend">
                        删除好友
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, nextTick } from 'vue';
import CusDialog from '@/src/components/CusDialog';
import { DialogResult } from '@/src/components/CusDialog/types';
import { useUserStore } from '@/src/store/user';
import { useSessionStore } from '@/src/store/session';
import { useMessageStore } from '@/src/store/message';
import { ImTypes } from '@shared/types';
import { ElMessage } from 'element-plus';
import { extractTargetIdFromSessionId } from '@/src/utils/sessionUtils';
import { Edit, Delete } from '@element-plus/icons-vue';
import { friendService, messageService } from '@/src/services';

const props = defineProps<{
    chat: ImTypes.Session;
}>();

const emit = defineEmits(['close']);

const userStore = useUserStore();
const sessionStore = useSessionStore();
const messageStore = useMessageStore();

const targetId = computed(() => extractTargetIdFromSessionId(props.chat.session_key, userStore.getUserID()) || 0);
const friendInfo = computed(() => userStore.getFriend(targetId.value));
const userInfo = computed(() => userStore.getUser(targetId.value));

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

    if (!targetId.value || !friendInfo.value) {
        return;
    }

    try {
        await friendService.updateFriend({
            friend_id: targetId.value,
            remark: editRemarkValue.value,
            blocked: friendInfo.value.blocked || false,
            starred: friendInfo.value.starred || false
        });

        ElMessage.success('备注修改成功');
    } catch (error) {
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
        await sessionStore.updateSessionOptions(props.chat.session_key, 3 - props.chat.is_top, undefined);
    } catch (error) {
        console.error(error);
    }
});

const handleUpdateDisturb = debounce(async (_val: string | number | boolean) => {
    try {
        await sessionStore.updateSessionOptions(props.chat.session_key, undefined, 3 - props.chat.is_disturb);
    } catch (error) {
        console.error(error);
    }
});

const clearChatData = async () => {
    const res = await CusDialog.open({
        title: '提示',
        content: '确定要清除本地的聊天记录吗？这不会影响其他设备的数据。',
        showCancel: true,
        confirmText: '确定',
        cancelText: '取消',
    });

    if (res === DialogResult.Confirm) {
        if (sessionStore.currentSessionKey === props.chat.session_key) {
            messageStore.messages = [];
        }

        await messageService.clearMessagesBySessionId(props.chat.session_id);

        props.chat.max_seq = '0';
        props.chat.last_content = '';
        ElMessage.success('聊天记录已清除');
        emit('close');
    }
};

const confirmDeleteFriend = async () => {
    const res = await CusDialog.open({
        title: '提示',
        content: `确定要删除好友 ${friendInfo.value?.remark || userInfo.value?.user_name || targetId.value} 吗？`,
        showCancel: true,
        confirmText: '确定',
        cancelText: '取消',
    });

    if (res === DialogResult.Confirm) {
        if (!targetId.value || !friendInfo.value) {
            ElMessage.error('好友不存在');
            return;
        }
        try {
            await friendService.deleteFriend(targetId.value);
            emit('close');
        } catch (e) {
            ElMessage.error('删除请求失败');
        }
    }
};
</script>

<style scoped lang="scss">
@use "sass:color";
@use "@/src/style/constant.scss" as *;

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

            .action-group {
                padding: 0;
                cursor: pointer;
                transition: background-color 0.2s;

                &:hover {
                    background-color: var(--bg-hover, #f3f4f6);
                }

                .center-item {
                    justify-content: center;
                    border-bottom: none;
                    font-size: 15px;
                    font-weight: 500;
                    padding: 12px 10px;
                    display: flex;
                    width: 100%;
                    box-sizing: border-box;
                }

                .text-primary {
                    color: var(--color-primary);
                }

                .text-danger {
                    color: var(--color-error, #ff4d4f);
                }
            }
        }
    }
}
</style>
