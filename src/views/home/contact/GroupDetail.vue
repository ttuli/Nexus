<template>
    <div class="group-detail">
        <TitleBar title="群组详情" :need-min="false" :need-max="false" />

        <div class="main-content" v-if="groupInfo">
            <div class="content-scroll">
                <!-- Header Info -->
                <div class="info-card">
                    <div class="header-row">
                        <template v-if="groupInfo.owner_id === userStore.userID">
                            <AvatarUpload :uid="groupInfo.id" type="group" class="group-avatar"
                                style="width: 80px; height: 80px;" @success="handleAvatarSuccess" />
                        </template>
                        <template v-else>
                            <Avatar :uid="groupInfo.id" type="group" :width="'80px'" :height="'80px'"
                                class="group-avatar" />
                        </template>
                        <div class="text-info">
                            <div class="main-info">
                                <h2 class="group-name">{{ groupInfo.name }}</h2>
                            </div>
                            <div class="group-id" @click="copyGroupId" title="点击复制">
                                群号: {{ groupInfo.id }}
                                <el-icon class="copy-icon">
                                    <CopyDocument />
                                </el-icon>
                            </div>
                            <!-- <div class="desc" v-if="groupInfo.notice">公告: {{ groupInfo.notice || '暂无公告' }}</div> -->
                        </div>
                    </div>
                </div>

                <!-- Members Grid -->
                <GroupMemberGrid :members="members" 
                :total-count="groupInfo.member_count" 
                :max-width="600" />

                <!-- Group Announcement -->
                <div class="notice-card">
                    <div class="notice-header">
                        <span class="title">群公告</span>
                    </div>
                    <div class="notice-content">
                        {{ groupInfo.notice || '暂无公告' }}
                    </div>
                </div>


                <!-- Settings List -->
                <div class="section-card settings">
                    <!-- ImTypes.GroupInfo Settings -->
                    <div class="setting-item static">
                        <span class="label">群聊名称</span>
                        <span class="value">{{ groupInfo.name }}</span>
                    </div>
                    <div class="setting-item static">
                        <span class="label">我在本群的昵称</span>
                        <span class="value">{{ myNickname }}</span>
                    </div>
                </div>
            </div>

            <!-- Quit Button -->
            <div class="quit-section">
                <CusButton type="primary" @click="toChat" :show-icon="false">发消息</CusButton>
                <CusButton class="danger-btn" :show-icon="false" @click="confirmQuit">退出群聊</CusButton>
            </div>
        </div>

        <div v-else class="loading-state">
            <GlobalLoading />
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import GroupMemberGrid from './components/GroupMemberGrid.vue';
import { useUserStore } from '@/src/store/user';
import { generateGroupSessionId } from '@/src/utils/sessionUtils';

defineOptions({ name: 'GroupDetail' });
import { useChatNavigation } from '@/src/composables/useChatNavigation';
import { useGroup } from '@/src/composables/useGroup';
import { ElMessage } from 'element-plus';
import { CopyDocument } from '@element-plus/icons-vue';
import CusDialog from '@/src/components/CusDialog';
import { DialogResult } from '@/src/components/CusDialog/types';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const { navigateToChat } = useChatNavigation();

const groupId = computed(() => parseInt(route.query.id as string));
const {
    groupInfo,
    members,
    myNickname,
    loadInfo,
    loadMembers,
    copyGroupId: copyGroupIdToClipboard,
    updateGroup,
    quitOrDismiss,
} = useGroup(groupId);

watch(groupId, (newId) => {
    if (newId) {
        loadInfo(true);
        loadMembers(true);
    }
}, { immediate: true });

const toChat = () => {
    if (!groupInfo.value) return;
    const sessionId = generateGroupSessionId(groupInfo.value.id);
    navigateToChat(sessionId, { toggle: false });
    router.push('/home/chat');
};

const copyGroupId = async () => {
    const ok = await copyGroupIdToClipboard();
    ok ? ElMessage.success('群号已复制') : ElMessage.error('复制失败');
};

const handleAvatarSuccess = async (url: string) => {
    if (!groupInfo.value) return;
    const success = await updateGroup({ avatar: url });
    if (success) {
        ElMessage.success('群头像修改成功');
    } else {
        ElMessage.error('群头像修改失败');
    }
};

const confirmQuit = async () => {
    if (groupInfo.value?.owner_id === userStore.userID) {
        const res = await CusDialog.open({
            title: '警告',
            content: '您可选择解散群聊或仅自己退出',
            showCancel: true,
            confirmText: '仅自己退出',
            cancelText: '解散群聊',
        });

        if (res === DialogResult.Confirm) {

        } else if (res === DialogResult.Cancel) {
            // Dissolve
            await quitOrDismiss(true);
            ElMessage.success('已解散该群聊');
            router.push('/home/contact');
        }
        return;
    }

    const res = await CusDialog.open({
        title: '警告',
        content: '确定要退出该群聊吗？退出后将无法查看历史消息。',
        showCancel: true,
        confirmText: '确定退出',
        cancelText: '取消',
    });

    if (res === DialogResult.Confirm) {
        await doQuit();
    }
};

const doQuit = async () => {
    if (!groupInfo.value) return;
    try {
        await quitOrDismiss(false);
        ElMessage.success('已退出该群聊');
        router.push('/home/contact');
    } catch (e) {
        ElMessage.error('退出失败');
    }
};
</script>

<style scoped lang="scss">
@use "sass:color";
@use "@/src/style/_constant.scss" as *;

.group-detail {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    background-color: $bg-body;

    .main-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        width: 100%;

        .content-scroll {
            flex: 1;
            padding: 24px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 20px;
            max-width: 650px; // Limit width for large screens
            margin: 0 auto;
            width: 100%;
            box-sizing: border-box;

            // Hide scrollbar but allow scrolling
            &::-webkit-scrollbar {
                width: 6px;
                background-color: transparent;
            }

            &::-webkit-scrollbar-thumb {
                background-color: transparent;
                border-radius: 4px;
            }

            &:hover::-webkit-scrollbar-thumb {
                background-color: var(--border-divider);
            }

            .info-card {
                background: $bg-card;
                border-radius: 12px;
                padding: 20px;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
                display: flex;
                flex-direction: column;
                gap: 20px;

                .header-row {
                    display: flex;
                    gap: 20px;
                    align-items: flex-start;

                    .text-info {
                        flex: 1;
                        display: flex;
                        flex-direction: column;
                        gap: 8px;

                        .main-info {
                            display: flex;
                            align-items: center;
                            gap: 8px;

                            .group-name {
                                margin: 0;
                                font-size: 20px;
                                font-weight: 600;
                                color: $color-text-primary;
                            }

                            .member-count {
                                font-size: 14px;
                                color: $color-text-secondary;
                            }
                        }

                        .group-id {
                            font-size: 14px;
                            color: $color-text-secondary;
                            -webkit-app-region: no-drag;
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            gap: 4px;
                            transition: color 0.2s;

                            &:hover {
                                color: $color-primary;
                            }
                        }

                        .desc {
                            font-size: 14px;
                            color: $color-text-secondary;
                            margin-top: 4px;
                            line-height: 1.5;
                        }
                    }
                }
            }

            .notice-card {
                background: $bg-card;
                border-radius: 12px;
                padding: 20px;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
                -webkit-app-region: no-drag;

                .notice-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 12px;

                    .title {
                        font-size: 16px;
                        font-weight: 600;
                        color: $color-text-primary;
                    }
                }

                .notice-content {
                    font-size: 14px;
                    color: $color-text-secondary;
                    line-height: 1.6;
                    white-space: pre-wrap;
                    word-break: break-all;
                }
            }

            .settings {
                background: $bg-card;
                border-radius: 12px;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
                padding: 0;
                overflow: hidden;

                .setting-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 16px 20px;
                    border-bottom: 1px solid $color-border;
                    cursor: pointer;
                    transition: background 0.2s;
                    -webkit-app-region: no-drag;

                    &:last-child {
                        border-bottom: none;
                    }

                    &:hover {
                        background-color: var(--bg-hover);
                    }

                    &.static {
                        cursor: default;
                        &:hover {
                            background-color: transparent;
                        }
                    }

                    .label {
                        font-size: 15px;
                        color: $color-text-primary;
                    }

                    .value {
                        font-size: 14px;
                        color: $color-text-secondary;
                        margin-right: 8px;
                    }

                    .arrow {
                        color: var(--text-disabled);
                        font-size: 18px;
                    }
                }
            }
        }

        .quit-section {
            display: flex;
            gap: 10px;
            padding: 24px;
            max-width: 600px;
            margin: 0 auto;
            width: 90%;
            box-sizing: border-box;
        }
    }

    .loading-state {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
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
