import { computed, ref, watch, onMounted, nextTick, toValue, type MaybeRefOrGetter } from 'vue';
import { ElMessage } from 'element-plus';
import { ImTypes } from '@shared/types';
import CusDialog from '@/src/components/CusDialog';
import { DialogResult } from '@/src/components/CusDialog/types';
import { useUserStore } from '@/src/store/user';
import { useSessionStore } from '@/src/store/session';
import { useMessageStore } from '@/src/store/message';
import { useGroup } from './useGroup';
import { useGroupActions } from './useGroupActions';
import { extractTargetIdFromSessionId } from '@/src/utils/sessionUtils';
import { sessionService } from '@/src/services/sessionService';

/**
 * 群聊会话侧栏的视图逻辑（GroupSessionSidebar 专属 view-model）。
 *
 * 定位：承接侧栏的全部业务编排——弹窗状态、表单状态、加载标记与各操作 handler，
 * 组件仅保留模板与样式。跨视图可复用的群操作在 useGroup / useGroupActions 中，
 * 本组合式函数只做面向该侧栏的粘合（含 toast / 确认弹窗等交互反馈）。
 *
 * @param chatInput 当前群会话（ref / getter / 原始值）
 * @param onClose 请求关闭侧栏的回调（如清除记录、退群后）
 */
export function useGroupSessionSidebar(
    chatInput: MaybeRefOrGetter<ImTypes.Session>,
    onClose?: () => void,
) {
    const userStore = useUserStore();
    const sessionStore = useSessionStore();
    const messageStore = useMessageStore();
    const { inviteGroupMembers, removeGroupMembers, loadGroupMembers, setMyGroupNickname } = useGroupActions();

    const chat = computed(() => toValue(chatInput));
    const targetIdVal = computed(() =>
        extractTargetIdFromSessionId(chat.value.session_key, userStore.getUserID()) || 0);

    const {
        groupInfo,
        members: groupMembers,
        currentUserMember,
        isOwner,
        isOwnerOrAdmin,
        copyGroupId: copyGroupIdToClipboard,
        updateGroup,
    } = useGroup(targetIdVal);

    onMounted(() => {
        if (targetIdVal.value && groupMembers.value.length === 0) {
            loadGroupMembers(targetIdVal.value);
        }
    });

    watch(() => targetIdVal.value, (newId) => {
        if (newId) {
            loadGroupMembers(newId);
        }
    });

    // ---- 群号复制 ----
    const copyGroupId = async () => {
        const ok = await copyGroupIdToClipboard();
        ok ? ElMessage.success('已复制') : ElMessage.error('复制失败，请手动复制');
    };

    // ---- 我的群昵称编辑 ----
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
            const success = await setMyGroupNickname(targetIdVal.value, editNicknameValue.value);
            success ? ElMessage.success('本群昵称修改成功') : ElMessage.error('修改失败');
        } catch {
            ElMessage.error('请求失败');
        }
    };

    // ---- 群设置弹窗 ----
    const settingsDialogVisible = ref(false);
    const submitLoading = ref(false);
    const editForm = ref({
        name: '',
        join_type: ImTypes.JoinType.JOIN_TYPE_DIRECT,
        notice: ''
    });

    const openGroupSettings = () => {
        if (!groupInfo.value) return;
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
        } catch {
            ElMessage.error('网络请求失败');
        } finally {
            submitLoading.value = false;
        }
    };

    // ---- 置顶 / 免打扰 ----
    const pinLoading = ref(false);
    const disturbLoading = ref(false);

    const handleUpdatePinned = async () => {
        if (pinLoading.value) return;
        pinLoading.value = true;
        try {
            await sessionStore.updateSessionOptions(chat.value.session_key, 3 - chat.value.is_top, undefined);
        } finally {
            pinLoading.value = false;
        }
    };

    const handleUpdateDisturb = async () => {
        if (disturbLoading.value) return;
        disturbLoading.value = true;
        try {
            await sessionStore.updateSessionOptions(chat.value.session_key, undefined, 3 - chat.value.is_disturb);
        } finally {
            disturbLoading.value = false;
        }
    };

    // ---- 清除本地聊天记录 ----
    const clearChatData = async () => {
        const res = await CusDialog.open({
            title: '提示',
            content: '确定要清除本地的聊天记录吗？这不会影响其他设备的数据。',
            showCancel: true,
            confirmText: '确定',
            cancelText: '取消',
        });
        if (res !== DialogResult.Confirm) return;

        if (sessionStore.currentSessionKey === chat.value.session_key) {
            messageStore.messages = [];
        }
        chat.value.max_seq = '0';
        chat.value.last_content = '';
        sessionStore.removeSession(chat.value.session_id);
        void sessionService.deleteOne(chat.value.session_id);
        ElMessage.success('聊天记录已清除');
        onClose?.();
    };

    const allMembersModalVisible = ref(false);
    const viewAllMembers = () => {
        allMembersModalVisible.value = true;
    };

    // ---- 邀请新成员 ----
    const inviteDialogVisible = ref(false);
    const inviteSubmitLoading = ref(false);
    const inviteMembers = () => {
        inviteDialogVisible.value = true;
    };

    const handleInviteMembers = async (data: { name: string; userIds: number[] }) => {
        if (data.userIds.length === 0) return;
        inviteSubmitLoading.value = true;
        try {
            const successCount = await inviteGroupMembers(targetIdVal.value, data.userIds);
            if (successCount === null) {
                ElMessage.error('邀请失败');
                return;
            }
            // 邀请为待确认制：仅发送邀请，被邀请人接受后才入群
            if (successCount > 0) {
                ElMessage.success(`已向 ${successCount} 人发送入群邀请，等待对方确认`);
            } else {
                ElMessage.info('所选用户已在群中或已有待处理邀请');
            }
            inviteDialogVisible.value = false;
        } catch (error) {
            console.error('[GroupSessionSidebar] invite members failed', error);
            ElMessage.error('网络请求失败');
        } finally {
            inviteSubmitLoading.value = false;
        }
    };

    // ---- 移除成员 ----
    const removeDialogVisible = ref(false);
    const removeSubmitLoading = ref(false);
    const removeMembers = () => {
        removeDialogVisible.value = true;
    };

    const handleRemoveMembers = async (userIds: number[]) => {
        if (!targetIdVal.value || userIds.length === 0) return;

        const confirmRes = await CusDialog.open({
            title: '提示',
            content: `确定要从群聊中移除选中的 ${userIds.length} 位成员吗？`,
            showCancel: true,
            confirmText: '确定',
            cancelText: '取消',
        });
        if (confirmRes !== DialogResult.Confirm) return;

        removeSubmitLoading.value = true;
        try {
            // 成员缓存先行摘除（列表即时刷新）；"xx 移除了 xx"系统消息与人数/本地 DB
            // 的权威同步由服务端 KICK 通知回执写入（携带 msg_id / session_id / seq）
            const ok = await removeGroupMembers(targetIdVal.value, userIds);
            if (ok) {
                removeDialogVisible.value = false;
                ElMessage.success('已移除选中的成员');
            } else {
                ElMessage.error('移除失败');
            }
        } catch (e) {
            console.error('[GroupSessionSidebar] remove members failed', e);
            ElMessage.error('操作失败');
        } finally {
            removeSubmitLoading.value = false;
        }
    };

    return {
        // 群状态
        targetIdVal,
        groupInfo,
        groupMembers,
        currentUserMember,
        isOwner,
        isOwnerOrAdmin,
        // 群号
        copyGroupId,
        // 昵称编辑
        isEditingNickname,
        editNicknameValue,
        nicknameInputRef,
        startEditNickname,
        handleSaveNickname,
        // 群设置
        settingsDialogVisible,
        submitLoading,
        editForm,
        openGroupSettings,
        saveGroupSettings,
        // 置顶/免打扰
        pinLoading,
        disturbLoading,
        handleUpdatePinned,
        handleUpdateDisturb,
        // 会话操作
        clearChatData,
        // 成员弹窗
        allMembersModalVisible,
        viewAllMembers,
        inviteDialogVisible,
        inviteSubmitLoading,
        inviteMembers,
        handleInviteMembers,
        removeDialogVisible,
        removeSubmitLoading,
        removeMembers,
        handleRemoveMembers,
    };
}
