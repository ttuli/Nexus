<template>
    <div class="friend-detail">
        <!-- 顶部标题占位：与外层 home/index.vue 的 TitleBar 等高，不重复渲染窗口按钮 -->
        <div class="page-header">
            <span class="page-title">{{ displayName }}</span>
        </div>

        <div class="main-content" v-if="userInfo">
            <div class="content-scroll scroll-bar-thin">
                <!-- Header Info Card -->
                <div class="info-card">
                    <div class="header-row">
                        <div class="avatar-wrapper">
                            <Avatar :uid="userInfo.user_id" width="80px" height="80px" />
                        </div>
                        <div class="text-info">
                            <div class="main-info">
                                <h2 class="name" :title="displayName">{{ displayName }}</h2>
                                <Male
                                    v-if="userInfo.gender === ImTypes.Gender.GENDER_MALE"
                                    class="gender-icon male app-icon app-icon--sm"
                                />
                                <Female
                                    v-else-if="userInfo.gender === ImTypes.Gender.GENDER_FEMALE"
                                    class="gender-icon female app-icon app-icon--sm"
                                />
                                <span v-if="friendInfo?.starred" class="status-tag starred">
                                    <Star class="app-icon app-icon--xs" />星标
                                </span>
                                <span v-if="friendInfo?.blocked" class="status-tag blocked">已拉黑</span>
                            </div>
                            <div
                                v-if="friendInfo?.remark && userInfo.user_name && userInfo.user_name !== friendInfo.remark"
                                class="nickname"
                            >
                                昵称: {{ userInfo.user_name }}
                            </div>
                            <div class="user-id" @click="handleCopy(String(userInfo.user_id))" title="点击复制 ID">
                                <span>ID: {{ userInfo.user_id }}</span>
                                <Copy class="copy-icon app-icon app-icon--xs" />
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Basic Info Card -->
                <div class="settings">
                    <div class="setting-item no-hover">
                        <span class="label">手机号码</span>
                        <span class="value" :class="{ muted: !userInfo.phone }">{{ userInfo.phone || '未公开' }}</span>
                        <span
                            v-if="userInfo.phone"
                            class="copy-link"
                            @click="handleCopy(String(userInfo.phone))"
                        >复制</span>
                    </div>
                    <div class="setting-item no-hover signature-item">
                        <span class="label">个性签名</span>
                        <span class="signature-text" :class="{ muted: !userInfo.personal_signature }">
                            {{ userInfo.personal_signature || '这个人很懒，什么都没有写~' }}
                        </span>
                    </div>
                </div>

                <!-- Friend Relationship Management Card -->
                <div class="settings" v-if="friendInfo">
                    <div class="setting-item" @click="openEditRemark">
                        <span class="label">设置备注</span>
                        <span class="value" :class="{ muted: !friendInfo.remark }">
                            {{ friendInfo.remark || '未设置' }}
                        </span>
                        <span class="arrow">›</span>
                    </div>
                    <div class="setting-item no-hover">
                        <span class="label">设为星标好友</span>
                        <CusSwitch :model-value="friendInfo.starred" @change="toggleStarred" />
                    </div>
                    <div class="setting-item no-hover">
                        <div class="label-group">
                            <span class="label">加入黑名单</span>
                            <span class="sub-label">拉黑后将不再接收对方消息</span>
                        </div>
                        <CusSwitch :model-value="friendInfo.blocked" @change="toggleBlocked" />
                    </div>
                </div>
            </div>

            <!-- Action Footer -->
            <div class="actions-section">
                <template v-if="friendInfo">
                    <div class="primary-actions">
                        <CusButton type="primary" @click="sendMsg" :show-icon="false">
                            <span class="btn-inner">
                                <MessageDots class="app-icon app-icon--sm" />
                                发消息
                            </span>
                        </CusButton>
                        <CusButton type="normal" @click="startVoiceCall" :show-icon="false">
                            <span class="btn-inner">
                                <CallCalling class="app-icon app-icon--sm" />
                                语音通话
                            </span>
                        </CusButton>
                    </div>
                    <button type="button" class="danger-link-btn" @click="confirmDelete">
                        删除好友
                    </button>
                </template>
                <template v-else>
                    <CusButton
                        type="primary"
                        :disabled="isApplying"
                        :show-icon="false"
                        @click="addFriend"
                    >
                        <span class="btn-inner">
                            <UserAdd v-if="!isApplying" class="app-icon app-icon--sm" />
                            {{ isApplying ? '等待验证' : '添加好友' }}
                        </span>
                    </CusButton>
                </template>
            </div>
        </div>

        <div v-else class="loading-state">
            <CusSpinner text="加载中..." />
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
import { CallCalling, Copy, Female, Male, MessageDots, Star, UserAdd } from 'reicon-vue';
import { ImTypes } from '@shared/types';
import { useUserStore } from '@/src/store/user';
import { useFriendActions } from '@/src/composables/useFriendActions';
import { useChatNavigation } from '@/src/composables/useChatNavigation';
import { generateSessionId } from '@/src/utils/sessionUtils';
import { copyToClipboard } from '@/src/utils/clipboard';
import { openAudioCallWindow } from '@/src/utils/window';
import CusInputDialog from '@/src/components/CusInputDialog';
import ApplyRelationModal from '@/src/components/ApplyRelationModal.vue';

defineOptions({ name: 'FriendDetail' });

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const { applyFriend, updateFriendRemark, toggleFriendStarred, toggleFriendBlocked, deleteFriend, loadUserInfo } = useFriendActions();
const { navigateToChat } = useChatNavigation();

const userId = computed(() => Number(route.query.uid));
const userInfo = computed(() => userStore.getUser(userId.value));
const friendInfo = computed(() => userStore.getFriend(userId.value));
const isApplying = computed(() => !friendInfo.value && userStore.isFriendRequest(userId.value));

// 主展示名：备注 > 昵称 > 默认文案（与左侧好友列表、聊天标题一致）
const displayName = computed(() => {
    return friendInfo.value?.remark || userInfo.value?.user_name || '用户';
});

const handleCopy = (text: string) => copyToClipboard(text);

const openEditRemark = async () => {
    if (!friendInfo.value) return;

    const newRemark = await CusInputDialog.open({
        title: '设置备注',
        placeholder: '请输入好友备注（留空清除）',
        initialValue: friendInfo.value.remark || '',
        maxLength: 20,
        allowEmpty: true,
    });

    if (newRemark !== undefined && newRemark !== (friendInfo.value.remark || '')) {
        try {
            await updateFriendRemark(userId.value, newRemark);
        } catch {
            // Error is handled inside composable
        }
    }
};

const toggleStarred = async (val: boolean) => {
    if (!friendInfo.value) return;
    try {
        await toggleFriendStarred(userId.value, val);
    } catch {
        // Error is handled inside toggleFriendStarred
    }
};

const toggleBlocked = async (val: boolean) => {
    if (!friendInfo.value) return;
    try {
        await toggleFriendBlocked(userId.value, val);
    } catch {
        // Error is handled inside toggleFriendBlocked
    }
};

const confirmDelete = async () => {
    if (!friendInfo.value) return;
    const ok = await deleteFriend(userId.value, { friendName: displayName.value });
    if (ok) {
        router.replace('/home/contacts/empty');
    }
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
    if (isApplying.value) return;
    showAddDialog.value = true;
};

const sendMsg = () => {
    const sessionId = generateSessionId(userId.value, userStore.getUserID());
    navigateToChat(sessionId, { toggle: false });
};

const startVoiceCall = () => {
    if (!userId.value) return;
    const sessionKey = generateSessionId(userId.value, userStore.getUserID());
    openAudioCallWindow(userId.value, sessionKey);
};

watch(userId, (newId) => {
    if (newId) {
        loadUserInfo(newId, true);
    }
}, { immediate: true });
</script>

<style scoped lang="scss">
.friend-detail {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    background-color: $bg-body;

    .page-header {
        height: 35px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0 120px;
        box-sizing: border-box;
        -webkit-app-region: drag;

        .page-title {
            font-size: 13px;
            font-weight: 500;
            color: $color-text-secondary;
            @include ellipsis;
        }
    }

    .main-content {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        width: 100%;
        -webkit-app-region: no-drag;

        .content-scroll {
            flex: 1;
            padding: 16px 24px 8px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 16px;
            max-width: 620px;
            margin: 0 auto;
            width: 100%;
            box-sizing: border-box;

            .info-card {
                background: $bg-card;
                border: 1px solid $color-border;
                border-radius: 12px;
                padding: 22px 24px;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);

                .header-row {
                    display: flex;
                    gap: 20px;
                    align-items: center;

                    .avatar-wrapper {
                        flex-shrink: 0;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }

                    .text-info {
                        flex: 1;
                        min-width: 0;
                        display: flex;
                        flex-direction: column;
                        gap: 6px;

                        .main-info {
                            display: flex;
                            align-items: center;
                            flex-wrap: wrap;
                            gap: 8px;

                            .name {
                                margin: 0;
                                font-size: 20px;
                                font-weight: 600;
                                line-height: 1.3;
                                color: $color-text-primary;
                                max-width: 100%;
                                @include ellipsis;
                            }

                            .gender-icon {
                                &.male {
                                    color: #3b82f6;
                                }

                                &.female {
                                    color: #ec4899;
                                }
                            }

                            .status-tag {
                                display: inline-flex;
                                align-items: center;
                                gap: 3px;
                                padding: 2px 8px;
                                border-radius: 999px;
                                font-size: 11px;
                                font-weight: 500;
                                line-height: 16px;

                                &.starred {
                                    color: #d97706;
                                    background: rgba(250, 173, 20, 0.14);
                                }

                                &.blocked {
                                    color: $color-error;
                                    background: rgba(255, 77, 79, 0.12);
                                }
                            }
                        }

                        .nickname {
                            font-size: 13px;
                            color: $color-text-secondary;
                            @include ellipsis;
                        }

                        .user-id {
                            align-self: flex-start;
                            font-size: 13px;
                            color: $color-text-secondary;
                            cursor: pointer;
                            display: inline-flex;
                            align-items: center;
                            gap: 5px;
                            transition: color 0.15s ease;

                            &:hover {
                                color: $color-primary;
                            }

                            .copy-icon {
                                opacity: 0.75;
                            }
                        }
                    }
                }
            }

            .settings {
                background: $bg-card;
                border: 1px solid $color-border;
                border-radius: 12px;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
                overflow: hidden;

                .setting-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 12px;
                    padding: 15px 20px;
                    border-bottom: 1px solid $color-border;
                    cursor: pointer;
                    transition: background-color 0.15s ease;

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

                        .signature-text {
                            width: 100%;
                            font-size: 14px;
                            color: $color-text-primary;
                            line-height: 1.6;
                            word-break: break-word;
                            white-space: pre-wrap;

                            &.muted {
                                color: $color-text-placeholder;
                            }
                        }
                    }

                    .label-group {
                        display: flex;
                        flex-direction: column;
                        gap: 2px;

                        .sub-label {
                            font-size: 12px;
                            color: $color-text-placeholder;
                        }
                    }

                    .label {
                        font-size: 14px;
                        color: $color-text-primary;
                        flex-shrink: 0;
                    }

                    .value {
                        font-size: 14px;
                        color: $color-text-secondary;
                        margin-left: auto;
                        @include ellipsis;

                        &.muted {
                            color: $color-text-placeholder;
                        }
                    }

                    .arrow {
                        color: var(--text-disabled);
                        font-size: 18px;
                        line-height: 1;
                    }

                    .copy-link {
                        flex-shrink: 0;
                        font-size: 12px;
                        font-weight: 500;
                        color: $color-primary;
                        background: var(--color-primary-bg);
                        padding: 4px 10px;
                        border-radius: 6px;
                        cursor: pointer;
                        transition: background-color 0.15s ease, color 0.15s ease;

                        &:hover {
                            background: $color-primary;
                            color: #ffffff;
                        }
                    }
                }
            }
        }

        .actions-section {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 10px;
            padding: 16px 24px 24px;
            max-width: 620px;
            margin: 0 auto;
            width: 100%;
            box-sizing: border-box;

            .primary-actions {
                display: flex;
                gap: 12px;
                width: 100%;
            }

            .btn-inner {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
            }

            .danger-link-btn {
                width: 100%;
                height: 36px;
                border-radius: 8px;
                border: 1px solid rgba($color-error, 0.25);
                background-color: $bg-card;
                color: $color-error;
                font-size: 13px;
                font-weight: 500;
                cursor: pointer;
                transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease;

                &:hover {
                    background-color: $color-error;
                    border-color: $color-error;
                    color: #ffffff;
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
