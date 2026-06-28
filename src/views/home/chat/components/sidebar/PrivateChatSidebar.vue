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
import CusSwitch from '@/src/components/CusSwitch.vue';
import CusDialog from '@/src/components/CusDialog/CusDialog';
import { DialogResult } from '@/src/components/CusDialog/types';
import { useUserStore } from '@/src/store/user';
import { useConversationStore } from '@/src/store/conversation';
import { useMessageStore } from '@/src/store/message';
import { ImTypes } from '@/src/types';
import { ElMessage } from 'element-plus';
import { extractTargetIdFromSessionId } from '@/src/utils/chat';
import { Edit } from '@element-plus/icons-vue';
import { friendService, messageService } from '@/src/services';
import { messageStorageService } from '@/src/services/messageStorageService';

const props = defineProps<{
    chat: ImTypes.Conversation;
}>();

const emit = defineEmits(['close']);

const userStore = useUserStore();
const conversationStore = useConversationStore();
const messageStore = useMessageStore();

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
        await friendService.updateFriend({
            friend_id: targetIdVal.value,
            remark: editRemarkValue.value,
            blocked: friendInfo.value.blocked || false,
            starred: friendInfo.value.starred || false
        });

        ElMessage.success('备注修改成功');
    } catch (error) {
    }
};

const pinLoading = ref(false);
const disturbLoading = ref(false);

const handleUpdatePinned = async (_val: string | number | boolean) => {
    if (pinLoading.value) return;
    pinLoading.value = true;
    try {
        await messageService.updateConversion(props.chat.conversation_id, 3 - props.chat.is_top, undefined);
    } finally {
        pinLoading.value = false;
    }
};

const handleUpdateDisturb = async (_val: string | number | boolean) => {
    if (disturbLoading.value) return;
    disturbLoading.value = true;
    try {
        await messageService.updateConversion(props.chat.conversation_id, undefined, 3 - props.chat.is_disturb);
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
        if (conversationStore.currentConvKey === props.chat.conv_key) {
            messageStore.messages = [];
        }

        await messageStorageService.clearMessagesBySessionId(props.chat.conversation_id);

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
@use "@/src/style/constant.scss" as *;

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

            .action-group {
                padding: 0;
                cursor: pointer;
                transition: background-color 0.2s;

                &:hover {
                    background-color: #f3f4f6;
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
</style>
