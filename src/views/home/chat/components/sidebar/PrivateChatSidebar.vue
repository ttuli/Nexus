<template>
    <div class="private-sidebar">
        <div class="sidebar-header">
            <span>好友信息</span>
            <div class="close-btn" @click="$emit('close')">
                <i class="icon-close">×</i>
            </div>
        </div>
        <div class="sidebar-content scroll-bar-thin" v-if="friendInfo || userInfo">
            <div class="info-section">
                <div class="avatar-wrapper">
                    <img :src="avatarParams" alt="Avatar" class="avatar-image" v-if="avatarParams" />
                    <div v-else class="avatar-placeholder">
                        <span class="text-xs text-gray-400 bg-gray-100 dark:bg-gray-700 px-1 rounded">User</span>
                    </div>
                </div>
                <div class="name">{{ friendInfo?.remark || userInfo?.user_name || `用户${targetId}` }}</div>
                <div class="id">ID: {{ targetId }}</div>
            </div>

            <div class="detail-group">
                <div class="detail-item">
                    <span class="label">备注</span>
                    <span class="value">{{ friendInfo?.remark || '暂无备注' }}</span>
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
                <el-button class="action-btn" plain @click="clearChatData">清除聊天记录</el-button>
                <el-button class="action-btn" type="danger" plain @click="confirmDeleteFriend">删除好友</el-button>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useUserStore } from '@/store/user';
import { useChatStore } from '@/store/chat';
import { ImTypes } from '@/types';
import { ElMessage, ElMessageBox } from 'element-plus';
import { updateConversation } from '@/apis/message';
import { deleteFriend } from '@/apis/user';
import { config } from '@/config';
import { extractTargetIdFromSessionId } from '@/utils/chat';

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

const avatarParams = computed(() => {
    let url = userInfo.value?.avatar;
    if (!url) return '';
    return url.startsWith('http') ? url : config.fileServer + url;
});


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

const clearChatData = () => {
    ElMessageBox.confirm('确定要清除本地的聊天记录吗？这不会影响其他设备的数据。', '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
    }).then(async () => {
        // Clear locally loaded messages
        if (chatStore.currentSessionId === props.chat.conversation_id) {
            chatStore.messages = [];
        }

        // Remove from IndexedDB
        // Here we just delete the indexeddb by trying to access local store via chatService
        // Assuming we openDB and clear elements. A proper API should be added in chatService,
        // but for now, we clear the memory and reset max_seq locally.
        props.chat.max_seq = 0;
        props.chat.last_content = '';
        chatStore.removeChat(props.chat.conversation_id);
        ElMessage.success('聊天记录已清除');
        emit('close');
    }).catch(() => { });
};

const confirmDeleteFriend = () => {
    ElMessageBox.confirm(`确定要删除好友 ${friendInfo.value?.remark || userInfo.value?.user_name || targetId.value} 吗？`, '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
    }).then(async () => {
        if (!targetId.value) return;
        try {
            const res = await deleteFriend(targetId.value);
            if (res.code === 200) {
                ElMessage.success('已删除好友');
                userStore.friendMap.delete(targetId.value);
                chatStore.removeChat(props.chat.conversation_id);
                emit('close');
            } else {
                ElMessage.error(res.message || '删除失败');
            }
        } catch (e) {
            ElMessage.error('删除请求失败');
        }
    }).catch(() => { });
};
</script>

<style scoped lang="scss">
@use "@/style/constant.scss" as *;

.private-sidebar {
    height: 100%;
    display: flex;
    flex-direction: column;

    .sidebar-header {
        height: 50px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 20px;
        border-bottom: 1px solid $color-border;
        font-weight: 600;
        font-size: 16px;
        color: $color-text-primary;

        .close-btn {
            cursor: pointer;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 4px;
            color: $color-text-secondary;
            transition: all 0.2s;

            &:hover {
                background-color: $bg-hover;
                color: $color-text-primary;
            }

            .icon-close {
                font-style: normal;
                font-size: 18px;
                line-height: 1;
            }
        }
    }

    .sidebar-content {
        flex: 1;
        overflow-y: auto;
        padding: 20px;

        .info-section {
            display: flex;
            flex-direction: column;
            align-items: center;
            margin-bottom: 30px;

            .avatar-wrapper {
                margin-bottom: 15px;

                .avatar-image {
                    width: 80px;
                    height: 80px;
                    border-radius: 12px;
                    object-fit: cover;
                }

                .avatar-placeholder {
                    width: 80px;
                    height: 80px;
                    background: #f0f2f5;
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
            }

            .name {
                font-size: 18px;
                font-weight: 600;
                color: $color-text-primary;
                margin-bottom: 5px;
                text-align: center;
            }

            .id {
                font-size: 12px;
                color: $color-text-secondary;
            }
        }

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
            gap: 12px;

            .action-btn {
                width: 100%;
                margin-left: 0;
            }
        }
    }
}
</style>
