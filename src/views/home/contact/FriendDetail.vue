<template>
    <div class="friend-detail">
        <TitleBar :title="title" :need-min="false" :need-max="false" />

        <div class="main-content" v-if="userInfo">
            <div class="content-scroll">
                <!-- Header Info Card -->
                <div class="info-card">
                    <div class="header-row">
                        <div class="avatar-wrapper">
                            <Avatar :uid="userInfo.user_id" :width="'80px'" :height="'80px'" class="user-avatar" />
                        </div>
                        <div class="text-info">
                            <div class="main-info">
                                <h2 class="name">{{ displayName }}</h2>
                                <Male class="gender-icon app-icon app-icon--sm"
                                    v-if="userInfo.gender === ImTypes.Gender.GENDER_MALE" />
                                <Female class="gender-icon app-icon app-icon--sm"
                                    v-if="userInfo.gender === ImTypes.Gender.GENDER_FEMALE" />
                            </div>
                            <div class="user-id" @click="handleCopy(String(userInfo.user_id))" title="点击复制 ID">
                                ID: {{ userInfo.user_id }}
                                <el-icon class="copy-icon">
                                    <CopyDocument />
                                </el-icon>
                            </div>
                            <div class="nickname" v-if="friendInfo?.remark">昵称: {{ friendInfo?.remark }}</div>
                        </div>
                    </div>
                </div>

                <!-- Info Settings Card -->
                <div class="section-card settings">
                    <div class="setting-item no-hover">
                        <span class="label">手机号码</span>
                        <span class="value">{{ userInfo.phone || '未公开' }}</span>
                        <span class="copy-link" v-if="userInfo.phone"
                            @click="handleCopy(String(userInfo.phone))">复制</span>
                    </div>
                    <div class="setting-item no-hover signature-item">
                        <span class="label">个性签名</span>
                        <span class="value signature">{{ userInfo.personal_signature || '这个人很懒，什么都没有写~' }}</span>
                    </div>
                </div>

                <!-- Friend Relationship Management Card -->
                <div class="section-card settings" v-if="friendInfo">
                    <div class="setting-item" @click="openEditRemark">
                        <span class="label">设置备注</span>
                        <span class="value">{{ friendInfo.remark || '未设置' }}</span>
                        <span class="arrow">›</span>
                    </div>
                    <div class="setting-item">
                        <span class="label">设为星标好友</span>
                        <CusSwitch :model-value="friendInfo.starred" @change="toggleStarred" />
                    </div>
                    <div class="setting-item">
                        <span class="label">加入黑名单</span>
                        <CusSwitch :model-value="friendInfo.blocked" @change="toggleBlocked" />
                    </div>
                </div>
            </div>

            <!-- Action Footer -->
            <div class="actions-section">
                <CusButton type="primary" @click="sendMsg" :show-icon="false">发消息</CusButton>
                <CusButton type="primary" class="add-friend-btn" v-if="!friendInfo" @click="addFriend" :show-icon="false">添加好友</CusButton>
                <CusButton class="danger-btn" v-else @click="confirmDelete" :show-icon="false">删除好友</CusButton>
            </div>
        </div>

        <div v-else class="loading-state">
            <GlobalLoading />
        </div>

        <!-- Add Friend Dialog -->
        <ApplyRelationModal
            :visible="showAddDialog"
            search-type="user"
            :target-user="userInfo || null"
            :target-group="null"
            @close="showAddDialog = false"
            @submit="confirmAddFriend"
        />
    </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useUserStore } from '@/src/store/user';
import { useFriendActions } from '@/src/composables/useFriendActions';

defineOptions({ name: 'FriendDetail' });
import { generateSessionId } from '@/src/utils/sessionUtils';
import { useChatNavigation } from '@/src/composables/useChatNavigation';
import { Male, Female } from 'reicon-vue';
import { ImTypes } from '@shared/types';
import { ElMessage } from 'element-plus';
import { CopyDocument } from '@element-plus/icons-vue';

import CusInputDialog from '@/src/components/CusInputDialog';
import ApplyRelationModal from '@/src/components/ApplyRelationModal.vue';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const { applyFriend, updateFriendRemark, toggleFriendStarred, toggleFriendBlocked, deleteFriend, loadUserInfo } = useFriendActions();
const { navigateToChat } = useChatNavigation();

const userId = computed(() => Number(route.query.uid));
const userInfo = computed(() => userStore.getUser(userId.value));
const friendInfo = computed(() => userStore.getFriend(userId.value));
const displayName = computed(() => {
    return userInfo.value?.user_name || '用户';
});

const title = computed(() => displayName.value);

const submitLoading = ref(false);

const handleCopy = async (text: string) => {
    try {
        await navigator.clipboard.writeText(text);
        ElMessage.success('复制成功');
    } catch (err) {
        ElMessage.error('复制失败');
    }
};

const openEditRemark = async () => {
    if (!friendInfo.value) return;

    const newRemark = await CusInputDialog.open({
        title: '设置备注',
        placeholder: '请输入好友备注',
        initialValue: friendInfo.value.remark || '',
        maxLength: 20
    });

    if (newRemark !== undefined && newRemark !== friendInfo.value.remark) {
        submitLoading.value = true;
        try {
            await updateFriendRemark(userId.value, newRemark);
        } catch (err) {
            // Error is handled inside composable
        } finally {
            submitLoading.value = false;
        }
    }
};

const toggleStarred = async (val: boolean) => {
    if (!friendInfo.value) return;
    try {
        await toggleFriendStarred(userId.value, val);
    } catch (err) {
        // Error is handled inside toggleFriendStarred
    }
};

const toggleBlocked = async (val: boolean) => {
    if (!friendInfo.value) return;
    try {
        await toggleFriendBlocked(userId.value, val);
    } catch (err) {
        // Error is handled inside toggleFriendBlocked
    }
};

const confirmDelete = async () => {
    if (!friendInfo.value) return;
    await deleteFriend(userId.value, { friendName: displayName.value });
};

const showAddDialog = ref(false);

const confirmAddFriend = async (message: string) => {
    if (!userInfo.value) return;
    try {
        await applyFriend({
            to_user_id: userInfo.value.user_id,
            apply_msg: message,
            source: ImTypes.ApplySource.APPLY_SOURCE_SEARCH_NAME
        });
    } finally {
        showAddDialog.value = false;
    }
};

const addFriend = () => {
    showAddDialog.value = true;
};

const sendMsg = () => {
    const sessionId = generateSessionId(userId.value, userStore.getUserID());
    navigateToChat(sessionId, { toggle: false });
    router.push('/home/chat');
};

watch(userId, (newId) => {
    if (newId) {
        loadUserInfo(newId, true);
    }
}, { immediate: true });
</script>

<style scoped lang="scss">
@use "@/src/style/_constant.scss" as *;

.friend-detail {
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
        -webkit-app-region: no-drag;

        .content-scroll {
            flex: 1;
            padding: 24px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 20px;
            max-width: 650px;
            margin: 0 auto;
            width: 100%;
            box-sizing: border-box;

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
                padding: 24px;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);

                .header-row {
                    display: flex;
                    gap: 24px;
                    align-items: center;

                    .avatar-wrapper {
                        display: flex;
                        align-items: center;
                        justify-content: center;

                        .user-avatar {
                            border-radius: 50%;
                            object-fit: cover;
                            transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);

                            &:hover {
                                transform: scale(1.05);
                            }
                        }
                    }

                    .text-info {
                        flex: 1;
                        display: flex;
                        flex-direction: column;
                        gap: 8px;

                        .main-info {
                            display: flex;
                            align-items: center;
                            gap: 8px;

                            .name {
                                margin: 0;
                                font-size: 22px;
                                font-weight: 600;
                                color: $color-text-primary;
                            }

                            .gender-icon {
                                width: 18px;
                                height: 18px;
                            }
                        }

                        .user-id {
                            font-size: 14px;
                            color: $color-text-secondary;
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            gap: 6px;
                            transition: color 0.2s;

                            &:hover {
                                color: $color-primary;
                            }

                            .copy-icon {
                                font-size: 14px;
                                display: inline-flex;
                                align-items: center;
                            }
                        }

                        .nickname {
                            font-size: 14px;
                            color: $color-text-secondary;
                        }
                    }
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

                    &:last-child {
                        border-bottom: none;
                    }

                    &:not(.no-hover):hover {
                        background-color: var(--bg-hover);
                    }

                    &.no-hover {
                        cursor: default;
                    }

                    &.signature-item {
                        flex-direction: column;
                        align-items: flex-start;
                        gap: 8px;

                        .value {
                            word-break: break-all;
                            line-height: 1.5;
                        }
                    }

                    .label {
                        font-size: 15px;
                        color: $color-text-primary;
                    }

                    .value {
                        font-size: 14px;
                        color: $color-text-secondary;
                        margin-left: auto;
                        margin-right: 8px;

                        &.signature {
                            font-style: italic;
                            color: $color-text-secondary;
                        }
                    }

                    .arrow {
                        color: var(--text-disabled);
                        font-size: 18px;
                    }

                    .copy-link {
                        font-size: 12px;
                        font-weight: 500;
                        color: $color-primary;
                        background: var(--color-primary-bg);
                        padding: 4px 10px;
                        border-radius: 6px;
                        cursor: pointer;
                        transition: all 0.2s;

                        &:hover {
                            background: $color-primary;
                            color: white;
                        }
                    }
                }
            }
        }

        .actions-section {
            display: flex;
            gap: 12px;
            padding: 24px;
            max-width: 600px;
            margin: 0 auto;
            width: 90%;
            box-sizing: border-box;

            :deep(.danger-btn) {
                background-color: $color-error !important;
                color: white !important;

                &:hover {
                    filter: brightness(0.9);
                }
            }
        }
    }

    .loading-state {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
    }
}
</style>
