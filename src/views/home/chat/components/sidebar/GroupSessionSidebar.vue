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
    </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue';
import CusSwitch from '@/src/components/CusSwitch.vue';
import { useUserStore } from '@/src/store/user';
import { useSessionStore } from '@/src/store/session';
import { useMessageStore } from '@/src/store/message';
import { useGroupActions } from '@/src/composables/useGroupActions';
import { useGroupStore } from '@/src/store/group';
import { ImTypes } from '@shared/types';
import { ElMessage, ElMessageBox } from 'element-plus';
import { extractTargetIdFromSessionId } from '@/src/utils/sessionUtils';
import GroupMembersCard from './GroupMembersCard.vue';
import { groupService } from '@/src/services';
import { sessionService } from '@/src/services/sessionService';

const props = defineProps<{
    chat: ImTypes.Session;
}>();

const emit = defineEmits(['close']);

const userStore = useUserStore();
const sessionStore = useSessionStore();
const { loadGroupMembers, quitOrDismissGroup } = useGroupActions();
const messageStore = useMessageStore();
const groupStore = useGroupStore();

const targetId = computed(() => extractTargetIdFromSessionId(props.chat.session_id, userStore.getUserID()));
const targetIdVal = computed(() => targetId.value || 0);
const groupInfo = computed(() => groupStore.getGroup(targetIdVal.value));

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
        loadGroupMembers(newId);
    }
});

const pinLoading = ref(false);
const disturbLoading = ref(false);

const handleUpdatePinned = async () => {
    if (pinLoading.value) return;
    pinLoading.value = true;
    try {
        await sessionStore.updateConversationOptions(props.chat.session_id, 3 - props.chat.is_top, undefined);
    } finally {
        pinLoading.value = false;
    }
};

const handleUpdateDisturb = async () => {
    if (disturbLoading.value) return;
    disturbLoading.value = true;
    try {
        await sessionStore.updateConversationOptions(props.chat.session_id, undefined, 3 - props.chat.is_disturb);
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
        props.chat.max_seq = 0;
        props.chat.last_content = '';
        sessionStore.removeSession(props.chat.session_id);
        void sessionService.deleteOne(props.chat.session_id);
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
            const res = await quitOrDismissGroup(numTargetId, isOwner.value);
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

const inviteMembers = () => {
    // TODO: Open invite friends dialog
    ElMessage.info('邀请功能开发中');
};
</script>

<style scoped lang="scss">
@use "sass:color";
@use "@/src/style/constant.scss" as *;

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
