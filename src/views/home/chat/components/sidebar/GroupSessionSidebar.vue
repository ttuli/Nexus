<template>
    <div class="group-sidebar">
        <div class="sidebar-content scroll-bar-thin" v-if="groupInfo">

            <!-- 群信息卡片 -->
            <div class="group-info-card">
                <div class="group-info-main">
                    <Avatar type="group" :uid="targetIdVal" width="50px" height="50px" class="group-avatar" />
                    <div class="group-meta">
                        <div class="group-name" :title="groupInfo.name">{{ groupInfo.name }}</div>
                        <div class="group-id-badge">
                            <el-tooltip content="点击复制群号" placement="top" :show-after="500">
                                <span class="group-id" @click="copyGroupId">{{ groupInfo.id }}</span>
                            </el-tooltip>
                        </div>
                    </div>
                </div>
                <CusButton class="group-action-btn" type="normal" :show-icon="false" v-if="isOwnerOrAdmin" @click="openGroupSettings" style="width: auto; height: 32px;">
                    <svg viewBox="0 0 1024 1024" class="btn-icon">
                        <path d="M589.6 128h-155.2c-14.2 0-26.2 10.3-28.5 24.4l-14.7 90.7c-21.9 8.2-42.5 19.8-61.3 34.3l-83.6-38.3c-13-5.9-28.1-1.3-35.8 10.5l-77.6 118.8c-7.7 11.8-5.3 27.5 5.5 36.4l70.7 58.2c-1.3 10.5-2 21.2-2 32s0.7 21.5 2 32l-70.7 58.2c-10.8 8.9-13.2 24.6-5.5 36.4l77.6 118.8c7.7 11.8 22.8 16.4 35.8 10.5l83.6-38.3c18.8 14.5 39.4 26.1 61.3 34.3l14.7 90.7c2.3 14.1 14.3 24.4 28.5 24.4h155.2c14.2 0 26.2-10.3 28.5-24.4l14.7-90.7c21.9-8.2 42.5-19.8 61.3-34.3l83.6 38.3c13 5.9 28.1 1.3 35.8-10.5l77.6-118.8c7.7-11.8 5.3-27.5-5.5-36.4l-70.7-58.2c1.3-10.5 2-21.2 2-32s-0.7-21.5-2-32l70.7-58.2c10.8-8.9 13.2-24.6 5.5-36.4l-77.6-118.8c-7.7-11.8-22.8-16.4-35.8-10.5l-83.6 38.3c-18.8-14.5-39.4-26.1-61.3-34.3l-14.7-90.7c-2.3-14.1-14.3-24.4-28.5-24.4z m-77.6 512c-70.7 0-128-57.3-128-128s57.3-128 128-128 128 57.3 128 128-57.3 128-128 128z" fill="currentColor"></path>
                    </svg>
                    <span>设置</span>
                </CusButton>
            </div>

            <!-- 群成员列表 -->
            <GroupMembersCard :members="groupMembers" :max-display="14" 
            :can-invite="true" @view-all="viewAllMembers"
            @invite="inviteMembers" />

            <!-- 我在本群的昵称 -->
            <div class="detail-group mt-15">
                <div class="detail-item remark-item">
                    <span class="label">群昵称</span>
                    <div class="value-wrapper" v-if="!isEditingNickname">
                        <span class="value">{{ currentUserMember?.nickname || '未设置' }}</span>
                        <el-icon class="edit-icon" @click="startEditNickname">
                            <Edit />
                        </el-icon>
                    </div>
                    <div class="edit-wrapper" v-else>
                        <el-input ref="nicknameInputRef" v-model.trim="editNicknameValue" size="small" :maxlength="20"
                            placeholder="请输入本群昵称" @blur="handleSaveNickname" @keyup.enter="handleSaveNickname" />
                    </div>
                </div>
            </div>

            <div class="detail-group mt-15">
                <div class="detail-item notice-item">
                    <div class="label">群公告</div>
                    <div class="value notice-text">{{ groupInfo.notice || '暂无群公告' }}</div>
                </div>
            </div>

            <div class="detail-group mt-15">
                <div class="detail-item action-toggle">
                    <span class="label">置顶聊天</span>
                    <CusSwitch :model-value="props.chat.is_top" :active-value="2" :inactive-value="1"
                        @change="handleUpdatePinned" :loading="pinLoading" />
                </div>
                <div class="detail-item action-toggle">
                    <span class="label">消息免打扰</span>
                    <CusSwitch :model-value="props.chat.is_disturb" :active-value="2" :inactive-value="1"
                        @change="handleUpdateDisturb" :loading="disturbLoading" />
                </div>
            </div>

            <div class="actions-section">
                <div class="detail-group action-group">
                    <div class="detail-item center-item text-primary" @click="clearChatData">
                        清除聊天记录
                    </div>
                </div>
                <div class="detail-group action-group mt-15">
                    <div class="detail-item center-item text-danger" @click="confirmQuitGroup">
                        {{ isOwner ? '解散该群' : '退出群聊' }}
                    </div>
                </div>
            </div>
        </div>

        <!-- 群设置模态弹窗 -->
        <CusModal :visible="settingsDialogVisible" title="修改群设置" width="380px" @close="settingsDialogVisible = false">
            <div class="form-group">
                <label>群聊名称</label>
                <div class="input-wrapper">
                    <input v-model="editForm.name" type="text" placeholder="请输入群名" class="modal-input" maxlength="30" />
                </div>
            </div>
            <div class="form-group row-layout">
                <label>需要验证</label>
                <Toggle
                    v-model="editForm.join_type"
                    :active-value="ImTypes.JoinType.JOIN_TYPE_AFTER_APPROVAL"
                    :inactive-value="ImTypes.JoinType.JOIN_TYPE_DIRECT"
                />
            </div>
            <div class="form-group">
                <label>群公告</label>
                <div class="input-wrapper textarea-wrapper">
                    <textarea
                        v-model="editForm.notice"
                        placeholder="请输入群公告"
                        class="modal-textarea"
                        rows="4"
                        maxlength="200"
                    ></textarea>
                </div>
            </div>
            <template #footer>
                <CusButton class="dialog-btn" type="normal" :show-icon="false" @click="settingsDialogVisible = false">取消</CusButton>
                <CusButton class="dialog-btn" type="primary" :show-icon="false" :loading="submitLoading" @click="saveGroupSettings">保存</CusButton>
            </template>
        </CusModal>

        <!-- 邀请群成员弹窗 -->
        <UserSelectorModal
            :visible="inviteDialogVisible"
            title="邀请新成员"
            confirm-text="邀请"
            :existing-member-ids="groupMembers.map(m => m.user_id)"
            :submit-loading="inviteSubmitLoading"
            @close="inviteDialogVisible = false"
            @submit="handleInviteMembers"
        />
    </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, nextTick } from 'vue';
import { Edit } from '@element-plus/icons-vue';
import { useUserStore } from '@/src/store/user';
import { useSessionStore } from '@/src/store/session';
import { useMessageStore } from '@/src/store/message';
import { useGroup } from '@/src/composables/useGroup';
import { ImTypes } from '@shared/types';
import { ElMessage, ElMessageBox } from 'element-plus';
import { extractTargetIdFromSessionId } from '@/src/utils/sessionUtils';
import GroupMembersCard from './components/GroupMembersCard.vue';
import UserSelectorModal from '@/src/components/UserSelectorModal.vue';
import { inviteMembers as apiInviteMembers } from '@/src/apis/group';
import { sessionService } from '@/src/services/sessionService';

const props = defineProps<{
    chat: ImTypes.Session;
}>();

const emit = defineEmits(['close']);

const userStore = useUserStore();
const sessionStore = useSessionStore();
const messageStore = useMessageStore();

const targetIdVal = computed(() => extractTargetIdFromSessionId(props.chat.session_key, userStore.getUserID()) || 0);
const {
    groupInfo,
    members: groupMembers,
    currentUserMember,
    isOwner,
    isOwnerOrAdmin,
    loadMembers,
    copyGroupId: copyGroupIdToClipboard,
    updateGroup,
    saveMyNickname,
    quitOrDismiss,
} = useGroup(targetIdVal);

// Group Nickname Editing Logic
const isEditingNickname = ref(false);
const editNicknameValue = ref('');
const nicknameInputRef = ref();

const startEditNickname = () => {
    editNicknameValue.value = currentUserMember.value?.nickname || '';
    isEditingNickname.value = true;
    nextTick(() => {
        nicknameInputRef.value?.focus();
    });
};

const handleSaveNickname = async () => {
    if (!isEditingNickname.value) return;
    isEditingNickname.value = false;

    const currentNickname = currentUserMember.value?.nickname || '';
    if (editNicknameValue.value === currentNickname) return;

    try {
        const success = await saveMyNickname(editNicknameValue.value);
        if (success) {
            ElMessage.success('本群昵称修改成功');
        } else {
            ElMessage.error('修改失败');
        }
    } catch (err) {
        ElMessage.error('请求失败');
    }
};

const settingsDialogVisible = ref(false);
const submitLoading = ref(false);
const editForm = ref({
    name: '',
    join_type: ImTypes.JoinType.JOIN_TYPE_DIRECT,
    notice: ''
});

const openGroupSettings = () => {
    if (!groupInfo.value) return;
    console.log(groupInfo.value)
    editForm.value = {
        name: groupInfo.value.name || '',
        join_type: groupInfo.value.join_type ?? ImTypes.JoinType.JOIN_TYPE_DIRECT,
        notice: groupInfo.value.notice || ''
    };
    settingsDialogVisible.value = true;
};

const saveGroupSettings = async () => {
    if (!groupInfo.value) return;
    if (!editForm.value.name.trim()) {
        ElMessage.warning('群名称不能为空');
        return;
    }
    submitLoading.value = true;
    try {
        const success = await updateGroup({
            name: editForm.value.name.trim(),
            notice: editForm.value.notice.trim(),
            join_type: editForm.value.join_type
        });
        if (success) {
            ElMessage.success('设置修改成功');
            settingsDialogVisible.value = false;
        } else {
            ElMessage.error('修改失败');
        }
    } catch (err) {
        ElMessage.error('网络请求失败');
    } finally {
        submitLoading.value = false;
    }
};

const copyGroupId = async () => {
    const ok = await copyGroupIdToClipboard();
    ok ? ElMessage.success('已复制') : ElMessage.error('复制失败，请手动复制');
};

onMounted(() => {
    if (targetIdVal.value && groupMembers.value.length === 0) {
        loadMembers();
    }
});

watch(() => targetIdVal.value, (newId) => {
    if (newId) {
        loadMembers();
    }
});

const pinLoading = ref(false);
const disturbLoading = ref(false);

const handleUpdatePinned = async () => {
    if (pinLoading.value) return;
    pinLoading.value = true;
    try {
        await sessionStore.updateSessionOptions(props.chat.session_key, 3 - props.chat.is_top, undefined);
    } finally {
        pinLoading.value = false;
    }
};

const handleUpdateDisturb = async () => {
    if (disturbLoading.value) return;
    disturbLoading.value = true;
    try {
        await sessionStore.updateSessionOptions(props.chat.session_key, undefined, 3 - props.chat.is_disturb);
    } finally {
        disturbLoading.value = false;
    }
};

const clearChatData = () => {
    ElMessageBox.confirm('确定要清除本地的聊天记录吗？这不会影响其他设备的数据。', '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
    }).then(async () => {
        if (sessionStore.currentSessionKey === props.chat.session_key) {
            messageStore.messages = [];
        }
        props.chat.max_seq = '0';
        props.chat.last_content = '';
        sessionStore.removeSession(props.chat.session_id);
        void sessionService.deleteOne(props.chat.session_id);
        ElMessage.success('聊天记录已清除');
        emit('close');
    }).catch(() => { });
};

const confirmQuitGroup = () => {
    if (!targetIdVal.value) return;
    const actionName = isOwner.value ? '解散' : '退出';
    const numTargetId = targetIdVal.value;
    ElMessageBox.confirm(`确定要${actionName}群聊 ${groupInfo.value?.name || numTargetId} 吗？`, '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
    }).then(async () => {
        try {
            const res = await quitOrDismiss(isOwner.value);
            if (res.code === 200) {
                ElMessage.success(`已${actionName}群聊`);
                emit('close');
            } else {
                ElMessage.error(res.message || '操作失败');
            }
        } catch (e) {
            ElMessage.error('请求失败');
        }
    }).catch(() => { });
};

const viewAllMembers = () => {
    // TODO: Open a more detailed dialog/drawer for members list
    ElMessage.info('查看全部群成员功能开发中');
};

const inviteDialogVisible = ref(false);
const inviteSubmitLoading = ref(false);

const inviteMembers = () => {
    inviteDialogVisible.value = true;
};

const handleInviteMembers = async (data: { name: string; userIds: number[] }) => {
    if (data.userIds.length === 0) return;
    inviteSubmitLoading.value = true;
    try {
        const res = await apiInviteMembers({
            group_id: targetIdVal.value,
            member_ids: data.userIds
        });
        const successCount = res?.data?.success_count ?? 0;
        if (res && res.data && res.data.success_count !== undefined) {
            // 邀请为待确认制：仅发送邀请，被邀请人接受后才入群
            if (successCount > 0) {
                ElMessage.success(`已向 ${successCount} 人发送入群邀请，等待对方确认`);
            } else {
                ElMessage.info('所选用户已在群中或已有待处理邀请');
            }
            inviteDialogVisible.value = false;
        } else {
            ElMessage.error('邀请失败');
        }
    } catch (error) {
        console.error('Failed to invite members', error);
        ElMessage.error('网络请求失败');
    } finally {
        inviteSubmitLoading.value = false;
    }
};
</script>

<style scoped lang="scss">
@use "sass:color";
@use "@/src/style/constant.scss" as *;

.group-sidebar {
    height: 100%;
    display: flex;
    flex-direction: column;
    width: 100%;

    .sidebar-content {
        flex: 1;
        overflow-y: auto;
        padding: 20px;

        .group-info-card {
            background-color: var(--surface-subtle, #f8fafc);
            border: 1px solid var(--border-color, #e2e8f0);
            border-radius: var(--radius-lg, 12px);
            padding: 15px;
            margin-bottom: 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;

            .group-info-main {
                display: flex;
                align-items: center;
                gap: 12px;
                flex: 1;
                min-width: 0;

                .group-avatar {
                    width: 50px;
                    height: 50px;
                    border-radius: 50%;
                    object-fit: cover;
                    flex-shrink: 0;
                    background-color: #e2e8f0;
                }

                .group-meta {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                    min-width: 0;
                    align-items: flex-start;

                    .group-name {
                        font-size: 15px;
                        font-weight: 600;
                        color: $color-text-primary;
                        width: 100%;
                        @include ellipsis;
                    }

                    .group-id-badge {
                        display: flex;
                        align-items: flex-start;

                        .group-id {
                            font-size: 12px;
                            color: $color-text-secondary;
                            background-color: var(--bg-hover, #f3f4f6);
                            padding: 2px 4px;
                            border-radius: 4px;
                            font-family: monospace;
                            font-weight: bold;
                            cursor: pointer;
                            transition: all 0.2s;

                            &:hover {
                                background-color: var(--bg-active, #e2e8f0);
                                color: var(--color-primary);
                            }
                        }
                    }
                }
            }

            .group-action-btn {
                width: auto;
                height: 30px;
                padding: 0 10px;
                flex-shrink: 0;

                .btn-icon {
                    width: 14px;
                    height: 14px;
                }
            }
        }

        .mt-15 {
            margin-top: 15px;
        }

        .detail-group {
            background-color: var(--surface-subtle, #f8fafc);
            border: 1px solid var(--border-color, #e2e8f0);
            border-radius: var(--radius-lg, 12px);
            padding: 4px 14px;

            .detail-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px 0;
                font-size: 14px;
                border-bottom: 1px solid var(--border-divider, #e5e7eb);

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

                &.notice-item {
                    flex-direction: column;
                    align-items: flex-start;

                    .label {
                        margin-bottom: 8px;
                        font-weight: 600;
                        color: $color-text-primary;
                    }

                    .notice-text {
                        color: $color-text-secondary;
                        font-size: 13px;
                        line-height: 1.5;
                        text-align: left;
                        white-space: pre-wrap;
                        @include ellipsis;
                        -webkit-line-clamp: 3;
                        line-clamp: 3;
                        -webkit-box-orient: vertical;
                        display: -webkit-box;
                        white-space: normal;
                    }
                }

                .label {
                    color: $color-text-secondary;
                    flex-shrink: 0;
                    margin-right: 15px;
                }

                .value {
                    color: $color-text-primary;
                    text-align: right;
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
                }

                .text-primary {
                    color: $color-text-primary;
                }

                .text-danger {
                    color: $color-error;
                }
            }
        }
    }
}

.form-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: flex-start;
    margin-bottom: 20px;

    &:last-child {
        margin-bottom: 0;
    }

    label {
        font-size: 14px;
        color: #4e5969;
        font-weight: 500;
    }

    .input-wrapper {
        width: 100%;
        background: #f2f3f5;
        border-radius: 6px;
        padding: 8px 12px;
        border: 1px solid transparent;
        transition: all 0.2s;
        box-sizing: border-box;

        &:focus-within {
            border-color: #3370ff;
            background: #ffffff;
        }

        .modal-input {
            width: 100%;
            border: none;
            background: transparent;
            outline: none;
            font-size: 14px;
            color: #1d2129;
            padding: 0;
        }

        .modal-textarea {
            width: 100%;
            border: none;
            background: transparent;
            outline: none;
            font-size: 14px;
            color: #1d2129;
            resize: none;
            font-family: inherit;
            padding: 0;
        }
    }

    &.row-layout {
        flex-direction: row;
        justify-content: space-between;
        align-items: center;

        label {
            margin-bottom: 0;
        }
    }
}

.dialog-btn {
    width: 80px;
}
</style>
