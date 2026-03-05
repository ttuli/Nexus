<template>
    <div class="group-sidebar">
        <div class="sidebar-content scroll-bar-thin" v-if="groupInfo">

            <!-- 群成员列表 -->
            <GroupMembersCard :members="groupMembers" :max-display="14" :can-invite="true" @view-all="viewAllMembers"
                @invite="inviteMembers" />

            <div class="detail-group">
                <div class="detail-item notice-item">
                    <div class="label">群公告</div>
                    <div class="value notice-text">{{ groupInfo.notice || '暂无群公告' }}</div>
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
                <CusButton class="action-btn" type="normal" :show-icon="false" @click="clearChatData">清除聊天记录</CusButton>
                <CusButton class="action-btn danger-btn" :show-icon="false" @click="confirmQuitGroup">
                    {{ isOwner ? '解散该群' : '退出群聊' }}
                </CusButton>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue';
import CusButton from '@/components/CusButton.vue';
import { useUserStore } from '@/store/user';
import { useChatStore } from '@/store/chat';
import { useGroupStore } from '@/store/group';
import { ImTypes } from '@/types';
import { ElMessage, ElMessageBox } from 'element-plus';
import { updateConversation } from '@/apis/message';
import { leaveGroup, dismissGroup } from '@/apis/group';
import { config } from '@/config';
import { extractTargetIdFromSessionId } from '@/utils/chat';
import GroupMembersCard from './GroupMembersCard.vue';
import { groupService } from '@/services';

const props = defineProps<{
    chat: ImTypes.Conversation;
}>();

const emit = defineEmits(['close']);

const userStore = useUserStore();
const chatStore = useChatStore();
const groupStore = useGroupStore();

const targetId = computed(() => extractTargetIdFromSessionId(props.chat.conversation_id, userStore.getUserID()));
const targetIdVal = computed(() => targetId.value || 0);
const groupInfo = computed(() => groupStore.getGroup(targetIdVal.value));

const avatarParams = computed(() => {
    let url = groupInfo.value?.avatar;
    if (!url) return '';
    return url.startsWith('http') ? url : config.fileServer + url;
});

const isOwner = computed(() => {
    return groupInfo.value?.owner_id === userStore.getUserID();
});

const groupMembers = computed(() => {
    return groupStore.getGroupMembers(targetIdVal.value) || [];
});

onMounted(async () => {
    if (targetId.value && (!groupMembers.value || groupMembers.value.length === 0)) {
        await groupService.fetchGroupMembers(targetId.value);
    }
});

watch(() => targetId.value, async (newId) => {
    if (newId) {
        await groupService.fetchGroupMembers(newId);
    }
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
        const isTop = val ? 1 : 2;
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
        if (chatStore.currentSessionId === props.chat.conversation_id) {
            chatStore.messages = [];
        }
        props.chat.max_seq = 0;
        props.chat.last_content = '';
        chatStore.removeChat(props.chat.conversation_id);
        ElMessage.success('聊天记录已清除');
        emit('close');
    }).catch(() => { });
};

const confirmQuitGroup = () => {
    if (!targetId.value) return;
    const actionName = isOwner.value ? '解散' : '退出';
    const numTargetId = targetId.value;
    ElMessageBox.confirm(`确定要${actionName}群聊 ${groupInfo.value?.name || numTargetId} 吗？`, '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
    }).then(async () => {
        try {
            let res;
            if (isOwner.value) {
                res = await dismissGroup({ group_id: numTargetId });
            } else {
                res = await leaveGroup({ group_id: numTargetId });
            }
            if (res.code === 200) {
                ElMessage.success(`已${actionName}群聊`);
                if (!isOwner.value) {
                    groupStore.joinedGroupIds.delete(numTargetId);
                } else {
                    groupStore.joinedGroupIds.delete(numTargetId);
                }
                chatStore.removeChat(props.chat.conversation_id);
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

const inviteMembers = () => {
    // TODO: Open invite friends dialog
    ElMessage.info('邀请功能开发中');
};
</script>

<style scoped lang="scss">
@use "sass:color";
@use "@/style/constant.scss" as *;

.group-sidebar {
    height: 100%;
    display: flex;
    flex-direction: column;

    .sidebar-content {
        flex: 1;
        overflow-y: auto;
        padding: 20px;

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
            gap: 12px;

            .action-btn {
                width: 100%;
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
