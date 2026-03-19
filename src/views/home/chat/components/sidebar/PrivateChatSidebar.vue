<template>
    <div class="private-sidebar">

        <div class="sidebar-content scroll-bar-thin" v-if="friendInfo || userInfo">
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

            <div class="detail-group mt-15">
                <div class="detail-item action-toggle">
                    <span class="label">置顶聊天</span>
                    <el-switch v-model="isPinned" @change="handleUpdatePinned" :loading="pinLoading" />
                </div>
                <div class="detail-item action-toggle">
                    <span class="label">消息免打扰</span>
                    <el-switch v-model="isDisturb" @change="handleUpdateDisturb" :loading="disturbLoading" />
                </div>
            </div>

            <div class="actions-section">
                <CusButton class="action-btn" type="primary" :show-icon="false" @click="clearChatData">清除聊天记录
                </CusButton>
                <CusButton class="action-btn danger-btn" :show-icon="false" @click="confirmDeleteFriend">删除好友
                </CusButton>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue';
import CusButton from '@/components/CusButton.vue';
import CusDialog from '@/components/CusDialog/CusDialog';
import { DialogResult } from '@/components/CusDialog/types';
import { useUserStore } from '@/store/user';
import { useChatStore } from '@/store/chat';
import { ImTypes } from '@/types';
import { ElMessage } from 'element-plus';
import { updateConversation } from '@/apis/message';
import { updateFriendInfo } from '@/apis/user';
import { extractTargetIdFromSessionId } from '@/utils/chat';
import { Edit } from '@element-plus/icons-vue';
import { chatService, friendService } from '@/services';

const props = defineProps<{
    chat: ImTypes.Conversation;
}>();

const emit = defineEmits(['close']);

const userStore = useUserStore();
const chatStore = useChatStore();

const targetId = computed(() => extractTargetIdFromSessionId(props.chat.conversation_id, userStore.getUserID()));
const targetIdVal = computed(() => targetId.value || 0);
const friendInfo = computed(() => userStore.getFriend(targetIdVal.value));
const userInfo = computed(() => userStore.getUser(targetIdVal.value));

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

    if (!targetIdVal.value || !friendInfo.value) {
        return;
    }

    try {
        const res = await updateFriendInfo({
            friend_id: targetIdVal.value,
            remark: editRemarkValue.value,
            blocked: friendInfo.value.blocked || false,
            starred: friendInfo.value.starred || false
        });

        if (res.code === 200) {
            ElMessage.success('备注修改成功');
            // Update local store preserving reactivity and keeping other fields
            const updatedFriend: ImTypes.Friend = { ...friendInfo.value, remark: editRemarkValue.value };
            userStore.setFriend(updatedFriend);
        } else {
            ElMessage.error(res.message || '修改失败');
        }
    } catch (error) {
        ElMessage.error('修改备注请求失败');
    }
};


// Sync local toggle state with store
const isPinned = ref(props.chat.is_top || false);
const isDisturb = ref(props.chat.is_disturb || false);

watch(() => props.chat, (newChat) => {
    isPinned.value = newChat.is_top || false;
    isDisturb.value = newChat.is_disturb || false;
}, { deep: true });

const pinLoading = ref(false);
const disturbLoading = ref(false);

const handleUpdatePinned = async (val: string | number | boolean) => {
    if (pinLoading.value) return;
    pinLoading.value = true;
    try {
        const isTop = val ? 1 : 2; // Usually 1=true, 2=false in this backend convention, or check specific backend req
        const res = await updateConversation({
            conversation_id: props.chat.conversation_id,
            is_top: isTop,
            is_disturb: 0,
            is_mute: 0,
        });
        if (res.code === 200) {
            props.chat.is_top = !!val;
            ElMessage.success(val ? '已设为置顶' : '已取消置顶');
        } else {
            isPinned.value = !val;
            ElMessage.error(res.message || '设置失败');
        }
    } catch (e) {
        isPinned.value = !val;
        ElMessage.error('设置失败');
    } finally {
        pinLoading.value = false;
    }
};

const handleUpdateDisturb = async (val: string | number | boolean) => {
    if (disturbLoading.value) return;
    disturbLoading.value = true;
    try {
        const isDisturbVal = val ? 1 : 2;
        const res = await updateConversation({
            conversation_id: props.chat.conversation_id,
            is_top: 0,
            is_disturb: isDisturbVal,
            is_mute: 0,
        });
        if (res.code === 200) {
            props.chat.is_disturb = !!val;
            ElMessage.success(val ? '已开启免打扰' : '已关闭免打扰');
        } else {
            isDisturb.value = !val;
            ElMessage.error(res.message || '设置失败');
        }
    } catch (e) {
        isDisturb.value = !val;
        ElMessage.error('设置失败');
    } finally {
        disturbLoading.value = false;
    }
};

const clearChatData = async () => {
    const res = await CusDialog.open({
        title: '提示',
        content: '确定要清除本地的聊天记录吗？这不会影响其他设备的数据。',
        showCancel: true,
        confirmText: '确定',
        cancelText: '取消',
    });

    if (res === DialogResult.Confirm) {
        if (chatStore.currentSessionId === props.chat.conversation_id) {
            chatStore.messages = [];
        }

        await chatService.clearMessagesBySessionId(props.chat.conversation_id);

        props.chat.max_seq = 0;
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
@use "@/style/constant.scss" as *;

.private-sidebar {
    height: 100%;
    display: flex;
    flex-direction: column;



    .sidebar-content {
        flex: 1;
        overflow-y: auto;
        padding: 20px;
        padding-top: 2px;

        .mt-15 {
            margin-top: 15px;
        }

        .detail-group {
            background-color: #f9fafb;
            border-radius: 8px;
            padding: 10px;

            .detail-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px 10px;
                font-size: 14px;
                border-bottom: 1px solid rgba($color-border, 0.5);

                &:last-child {
                    border-bottom: none;
                }

                &.action-toggle {
                    padding: 8px 10px;
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
                            color: $color-text-secondary;
                            font-size: 14px;
                            transition: color 0.2s;

                            &:hover {
                                color: var(--el-color-primary, $color-text-primary);
                            }
                        }
                    }

                    .edit-wrapper {
                        flex: 1;
                        display: flex;
                        justify-content: flex-end;

                        // Avoid input taking the full width pushing the label away completely
                        .el-input {
                            width: 150px;
                        }
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
            justify-content: center;
            align-items: center;
            gap: 12px;

            .action-btn {
                margin-left: 0;
            }
        }
    }
}

:deep(.danger-btn) {
    background-color: $color-error !important;
    color: white !important;

    &:hover {
        background-color: color.adjust($color-error, $lightness: -10%) !important;
    }
}
</style>
