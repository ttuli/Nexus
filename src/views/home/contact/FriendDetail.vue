<template>
    <div class="friend-detail">
        <TitleBar :title="title" :need-min="false" :need-max="false" />
        <div class="content" v-if="userInfo">
            <div class="user-card">
                <div class="card-body">
                    <div class="avatar-section">
                        <div class="avatar-wrapper">
                            <Avatar :uid="userInfo.user_id" class="user-avatar" />
                        </div>
                    </div>

                    <div class="info-section">
                        <div class="name-row">
                            <span class="remark">{{ displayName }}</span>
                            <el-icon class="edit-icon" @click="openEditRemark" title="修改备注">
                                <Edit />
                            </el-icon>
                            <img :src="MaleIcon" class="gender-icon"
                                v-if="userInfo.gender === ImTypes.Gender.GENDER_MALE" />
                            <img :src="FemaleIcon" class="gender-icon"
                                v-if="userInfo.gender === ImTypes.Gender.GENDER_FEMALE" />
                        </div>
                        <div class="sub-info">
                            <span class="nickname" v-if="friendInfo?.remark">昵称: {{ userInfo.user_name }}</span>
                            <span class="id-tag">
                                ID: {{ userInfo.user_id }}
                                <i class="copy-icon" @click="handleCopy(String(userInfo.user_id))">❐</i>
                            </span>
                        </div>
                    </div>

                    <div class="detail-list">
                        <div class="detail-item">
                            <div class="item-icon bg-blue">📱</div>
                            <div class="item-content">
                                <span class="label">手机号码</span>
                                <div class="value-row">
                                    <span class="value">{{ userInfo.phone || '未公开' }}</span>
                                    <span class="copy-link" v-if="userInfo.phone"
                                        @click="handleCopy(String(userInfo.phone))">复制</span>
                                </div>
                            </div>
                        </div>
                        <div class="detail-item">
                            <div class="item-icon bg-purple">✍️</div>
                            <div class="item-content">
                                <span class="label">个性签名</span>
                                <span class="value signature">{{ userInfo.personal_signature || '这个人很懒，什么都没有写~'
                                }}</span>
                            </div>
                        </div>
                    </div>

                    <div class="actions">
                        <CusButton @click="sendMsg" type="primary" :show-icon="false" class="action-btn">
                            发消息
                        </CusButton>
                    </div>
                </div>
            </div>
        </div>
        <div v-else class="loading">
            <div class="spinner"></div>
            <span>加载中...</span>
        </div>

        <el-dialog v-model="dialogVisible" title="设置备注" width="360px" :close-on-click-modal="false"
            class="remark-dialog">
            <div class="dialog-content">
                <el-input v-model="editRemarkForm.remark" placeholder="请输入好友备注" maxlength="20" show-word-limit
                    @keyup.enter="submitRemarkUpdate" />
            </div>
            <template #footer>
                <div class="dialog-footer">
                    <el-button @click="dialogVisible = false">取消</el-button>
                    <el-button type="primary" @click="submitRemarkUpdate" :loading="submitLoading">确定</el-button>
                </div>
            </template>
        </el-dialog>
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useUserStore } from '@/src/store/user';
import { generateSessionId } from '@/src/utils/sessionUtils';
import { useChatNavigation } from '@/src/composables/useChatNavigation';
import MaleIcon from '@/src/assets/gender/male.svg';
import FemaleIcon from '@/src/assets/gender/female.svg';
import { ImTypes } from '@/src/types';
import { ElMessage } from 'element-plus';
import { Edit } from '@element-plus/icons-vue';
import { userService } from '@/src/services';
import { updateFriendInfo } from '@/src/apis/user';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const { navigateToChat } = useChatNavigation();

const userId = computed(() => Number(route.query.uid));
const userInfo = computed(() => userStore.getUser(userId.value));
const friendInfo = computed(() => userStore.getFriend(userId.value));
const displayName = computed(() => {
    return friendInfo.value?.remark || userInfo.value?.user_name || '用户';
});

const title = computed(() => displayName.value);

const dialogVisible = ref(false);
const submitLoading = ref(false);
const editRemarkForm = ref({ remark: '' });

const handleCopy = async (text: string) => {
    try {
        await navigator.clipboard.writeText(text);
        ElMessage.success('复制成功');
    } catch (err) {
        ElMessage.error('复制失败');
    }
};

const openEditRemark = () => {
    editRemarkForm.value.remark = friendInfo.value?.remark || '';
    dialogVisible.value = true;
};

const submitRemarkUpdate = async () => {
    if (!friendInfo.value) return;

    submitLoading.value = true;
    try {
        await updateFriendInfo({
            friend_id: userId.value,
            remark: editRemarkForm.value.remark,
            blocked: friendInfo.value.blocked,
            starred: friendInfo.value.starred
        });

        // Update local store immediately
        userStore.setFriend({
            ...friendInfo.value,
            remark: editRemarkForm.value.remark
        });

        ElMessage.success('备注修改成功');
        dialogVisible.value = false;
    } catch (err: any) {
        ElMessage.error(err.message || '修改失败');
    } finally {
        submitLoading.value = false;
    }
};

const sendMsg = () => {
    const sessionId = generateSessionId(userId.value, userStore.getUserID());
    navigateToChat(sessionId);
    router.push('/home/chat');
};

onMounted(() => {
    userService.fetchByIds([userId.value], true);
});
</script>

<style scoped lang="scss">
@use "@/src/style/_constant.scss" as *;

.friend-detail {
    height: 100%;
    display: flex;
    flex-direction: column;
    position: relative;
    overflow: hidden;
    background-color: var(--el-bg-color-page);

    &::before {
        content: '';
        position: absolute;
        top: -15%;
        left: -5%;
        width: 50%;
        height: 40%;
        background: radial-gradient(circle, var(--el-color-primary-light-8) 0%, transparent 60%);
        filter: blur(50px);
        z-index: 0;
        pointer-events: none;
    }

    .content {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 40px 20px;
        overflow-y: auto;
        z-index: 1;

        &::-webkit-scrollbar {
            width: 0;
            display: none;
        }
    }

    .user-card {
        width: 100%;
        max-width: 440px;
        display: flex;
        flex-direction: column;
        align-items: center;

        .card-body {
            width: 100%;
            padding: 30px;
            display: flex;
            flex-direction: column;
            align-items: center;
            // Removed card background styles

            .avatar-section {
                margin-bottom: 24px;
                position: relative;
                -webkit-app-region: no-drag;

                .avatar-wrapper {
                    padding: 8px;
                    background: var(--el-fill-color-light);
                    border-radius: 50%;
                    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);

                    .user-avatar {
                        width: 80px;
                        height: 80px;
                        border-radius: 50%;
                        object-fit: cover;
                        transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);

                        &:hover {
                            transform: scale(1.05);
                        }
                    }
                }
            }

            .info-section {
                text-align: center;
                margin-bottom: 30px;
                width: 100%;

                .name-row {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 12px;
                    margin-bottom: 10px;

                    .remark {
                        font-family: 'Inter', 'PingFang SC', sans-serif;
                        font-size: 28px;
                        font-weight: 700;
                        color: var(--el-text-color-primary);
                    }

                    .edit-icon {
                        font-size: 18px;
                        color: var(--el-text-color-regular);
                        cursor: pointer;
                        padding: 4px;
                        border-radius: 50%;
                        transition: all 0.2s;
                        -webkit-app-region: no-drag;

                        &:hover {
                            color: var(--el-color-primary);
                            background: var(--el-color-primary-light-9);
                            transform: scale(1.1);
                        }
                    }

                    .gender-icon {
                        width: 20px;
                        height: 20px;
                    }
                }

                .sub-info {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;

                    .nickname {
                        font-size: 14px;
                        color: var(--el-text-color-secondary);
                    }

                    .id-tag {
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
                        gap: 8px;
                        font-size: 13px;
                        color: var(--el-text-color-regular);
                        background: var(--el-fill-color-light);
                        padding: 6px 16px;
                        border-radius: 20px;
                        margin: 4px auto 0;
                        transition: background-color 0.2s;

                        &:hover {
                            background: var(--el-fill-color);
                        }

                        .copy-icon {
                            font-style: normal;
                            cursor: pointer;
                            font-size: 12px;
                            transition: all 0.2s;
                            -webkit-app-region: no-drag;

                            &:hover {
                                transform: scale(1.2);
                                color: var(--el-color-primary);
                            }
                        }
                    }
                }
            }

            .detail-list {
                width: 100%;
                display: flex;
                flex-direction: column;
                gap: 16px;
                margin-bottom: 40px;

                .detail-item {
                    display: flex;
                    align-items: center;
                    background: var(--el-fill-color-blank);
                    padding: 16px 20px;
                    border-radius: 16px;
                    border: 1px solid var(--el-border-color-light);
                    transition: all 0.3s ease;
                    -webkit-app-region: no-drag;

                    &:hover {
                        transform: translateY(-2px);
                        box-shadow: var(--el-box-shadow-light);
                        border-color: var(--el-color-primary-light-5);
                    }

                    .item-icon {
                        font-size: 18px;
                        width: 40px;
                        height: 40px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        border-radius: 12px;
                        margin-right: 16px;

                        &.bg-blue {
                            background: rgba(64, 158, 255, 0.1);
                        }

                        &.bg-purple {
                            background: rgba(142, 68, 173, 0.1);
                        }
                    }

                    .item-content {
                        flex: 1;
                        display: flex;
                        flex-direction: column;
                        gap: 4px;

                        .label {
                            font-size: 12px;
                            color: var(--el-text-color-secondary);
                        }

                        .value-row {
                            display: flex;
                            align-items: center;
                            justify-content: space-between;

                            .copy-link {
                                font-size: 12px;
                                font-weight: 500;
                                color: var(--el-color-primary);
                                background: var(--el-color-primary-light-9);
                                padding: 4px 10px;
                                border-radius: 6px;
                                cursor: pointer;
                                transition: all 0.2s;

                                &:hover {
                                    background: var(--el-color-primary);
                                    color: white;
                                }
                            }
                        }

                        .value {
                            font-size: 15px;
                            color: var(--el-text-color-primary);
                            line-height: 1.5;

                            &.signature {
                                color: var(--el-text-color-regular);
                                font-style: italic;
                            }
                        }
                    }
                }
            }

            .actions {
                width: 100%;
                display: flex;
                justify-content: center;

                .action-btn {
                    width: 100%;
                    max-width: 300px;
                    height: 50px;
                    font-size: 16px;
                    border-radius: 25px;
                    font-weight: 600;
                    letter-spacing: 2px;
                    transition: all 0.3s;

                    &:hover {
                        transform: translateY(-2px);
                        box-shadow: 0 8px 20px var(--el-color-primary-light-5);
                    }

                    &:active {
                        transform: scale(0.98);
                    }
                }
            }
        }
    }

    .loading {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        color: var(--el-text-color-secondary);
        gap: 12px;

        .spinner {
            width: 32px;
            height: 32px;
            border: 3px solid var(--el-border-color-lighter);
            border-top-color: var(--el-color-primary);
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
        }
    }
}

:deep(.remark-dialog) {
    border-radius: 12px;
    overflow: hidden;

    .el-dialog__header {
        margin-right: 0;
        padding-bottom: 20px;
        border-bottom: 1px solid var(--el-border-color-lighter);
    }

    .el-dialog__body {
        padding: 24px 20px;
    }

    .el-dialog__footer {
        padding-top: 10px;
        border-top: 1px solid var(--el-border-color-lighter);
    }
}

@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}
</style>
