<template>
    <div class="base-user-info">
        <!-- Avatar Section -->
        <div class="avatar-section">
            <AvatarUpload :uid="userStore.getUserID()" @success="handleAvatarSuccess" />
            <div class="user-name">{{ userInfo?.user_name || '加载中...' }}</div>
            <div class="user-signature" v-if="userInfo?.personal_signature">
                {{ userInfo.personal_signature }}
            </div>
        </div>

        <!-- Info Cards -->
        <div class="info-cards">
            <div class="info-card">
                <div class="card-title">基本信息</div>
                <div class="info-row">
                    <span class="label">用户ID</span>
                    <span class="value">{{ userInfo?.user_id }}</span>
                </div>
                <div class="info-row">
                    <span class="label">用户名</span>
                    <span class="value">{{ userInfo?.user_name }}</span>
                </div>
                <div class="info-row">
                    <span class="label">性别</span>
                    <span class="value">{{ genderText }}</span>
                </div>
                <div class="info-row">
                    <span class="label">手机号</span>
                    <span class="value">{{ maskPhone(userInfo?.phone) }}</span>
                </div>
            </div>

            <div class="info-card">
                <div class="card-title">账号设置</div>
                <div class="info-row">
                    <span class="label">加好友方式</span>
                    <span class="value">{{ joinTypeText }}</span>
                </div>
                <div class="info-row">
                    <span class="label">个性签名</span>
                    <span class="value signature">{{ userInfo?.personal_signature || '未设置' }}</span>
                </div>
            </div>
            <!-- Edit Button -->
            <div class="action-buttons">
                <CusButton type="primary" @click="openEditDialog" :show-icon="false">
                    编辑资料
                </CusButton>
            </div>

            <!-- Edit Dialog -->
            <Teleport to="body">
                <Transition name="fade">
                    <div v-if="showEditDialog" class="modal-overlay" @click="showEditDialog = false">
                        <div class="modal-card" @click.stop>
                            <div class="modal-header">
                                <span>编辑资料</span>
                                <button class="close-btn" @click="showEditDialog = false">×</button>
                            </div>
                            <div class="modal-body">
                                <div class="form-item">
                                    <label>用户名</label>
                                    <input v-model="editForm.user_name" type="text" placeholder="请输入用户名" />
                                </div>
                                <div class="form-item">
                                    <label>性别</label>
                                    <CusDropdown
                                        v-model="editForm.gender"
                                        :options="genderOptions"
                                        placeholder="选择性别"
                                    />
                                </div>
                                <div class="form-item row-layout">
                                    <label>加好友需要验证</label>
                                    <Toggle
                                        v-model="editForm.join_type"
                                        :active-value="ImTypes.JoinType.JOIN_TYPE_AFTER_APPROVAL"
                                        :inactive-value="ImTypes.JoinType.JOIN_TYPE_DIRECT"
                                    />
                                </div>
                                <div class="form-item">
                                    <label>个性签名</label>
                                    <textarea v-model="editForm.personal_signature" placeholder="请输入个性签名"
                                        rows="3"></textarea>
                                </div>
                            </div>
                            <div class="modal-footer">
                                <CusButton type="normal" @click="showEditDialog = false" :disabled="updating"
                                    :show-icon="false">
                                    取消
                                </CusButton>
                                <CusButton type="primary" @click="handleUpdateProfile" :loading="updating"
                                    :show-icon="false">
                                    保存
                                </CusButton>
                            </div>
                        </div>
                    </div>
                </Transition>
            </Teleport>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useUserStore } from '@/src/store/user';
import CusDropdown from '@/src/components/CusDropdown.vue';
import Toggle from '@/src/components/Toggle.vue';

const genderOptions = [
    { value: ImTypes.Gender.GENDER_MALE, label: '男', icon: '👨' },
    { value: ImTypes.Gender.GENDER_FEMALE, label: '女', icon: '👩' }
];

import { ImTypes, ResourceType, UpdateAction } from '@/src/types';
import { ElMessage } from 'element-plus';
import { cacheService, userService } from '@/src/services';
import { signalWindowReady } from '@/src/utils/windowReady';

const userStore = useUserStore();

const userInfo = computed(() => userStore.getUser(userStore.getUserID()));

// Computed displays
const genderText = computed(() => {
    if (!userInfo.value) return '-';
    switch (userInfo.value.gender) {
        case ImTypes.Gender.GENDER_MALE: return '男';
        case ImTypes.Gender.GENDER_FEMALE: return '女';
        default: return '未知';
    }
});

const joinTypeText = computed(() => {
    if (!userInfo.value) return '-';
    switch (userInfo.value.join_type) {
        case ImTypes.JoinType.JOIN_TYPE_DIRECT: return '直接添加';
        case ImTypes.JoinType.JOIN_TYPE_AFTER_APPROVAL: return '需要验证';
        default: return '未知';
    }
});

// Mask phone number
const maskPhone = (phone?: string) => {
    if (!phone) return '-';
    if (phone.length >= 7) {
        return phone.slice(0, 3) + '****' + phone.slice(-4);
    }
    return phone;
};

const handleAvatarSuccess = async (url: string) => {
    if (!userInfo.value) {
        ElMessage.error('用户信息不存在');
        return;
    }
    try {
        await cacheService.updateItems(UpdateAction.Update, ResourceType.USER, [{ ...userInfo.value, avatar: url }]);
        await userService.cacheLoginAccount(userStore.getUserID());
        ElMessage.success('头像更新成功');
    } catch (error) {
        console.error('Failed to update avatar:', error);
        ElMessage.error('头像更新失败');
    }
};

// Edit Profile Logic
const showEditDialog = ref(false);
const editForm = ref({
    user_name: '',
    gender: ImTypes.Gender.GENDER_MALE,
    join_type: ImTypes.JoinType.JOIN_TYPE_DIRECT,
    personal_signature: ''
});
const updating = ref(false);

const openEditDialog = () => {
    if (!userInfo.value) return;
    editForm.value = {
        user_name: userInfo.value.user_name,
        gender: userInfo.value.gender,
        join_type: userInfo.value.join_type,
        personal_signature: userInfo.value.personal_signature || ''
    };
    showEditDialog.value = true;
};

const handleUpdateProfile = async () => {
    if (!userInfo.value) {
        ElMessage.error('用户信息不存在');
        return;
    }
    if (!editForm.value.user_name.trim()) {
        ElMessage.warning('用户名不能为空');
        return;
    }

    updating.value = true;
    try {
        let changes: ImTypes.UserInfo = {
            user_id: userInfo.value.user_id,
            user_name: '',
            avatar: userInfo.value.avatar,
            phone: userInfo.value.phone,
            gender: userInfo.value.gender,
            join_type: userInfo.value.join_type,
            status: userInfo.value.status,
            personal_signature: '',
            create_time: userInfo.value.create_time,
            update_time: userInfo.value.update_time,
        };
        let hasChanged = false;
        if (userInfo.value.user_name !== editForm.value.user_name) { changes.user_name = editForm.value.user_name; hasChanged = true; }
        if (userInfo.value.gender !== editForm.value.gender) { changes.gender = editForm.value.gender; hasChanged = true; }
        if (userInfo.value.join_type !== editForm.value.join_type) { changes.join_type = editForm.value.join_type; hasChanged = true; }
        if (userInfo.value.personal_signature !== editForm.value.personal_signature) { changes.personal_signature = editForm.value.personal_signature; hasChanged = true; }

        if (!hasChanged) {
            showEditDialog.value = false;
            return;
        }

        const success = await userService.updateUserInfo(changes);
        if (success) {
            ElMessage.success('修改成功');
            showEditDialog.value = false;
        } else {
            ElMessage.error('修改失败');
        }
    } catch (error) {
        console.error('Failed to update profile:', error);
    } finally {
        updating.value = false;
    }
};
onMounted(async () => {
    await userService.fetchByIds([userStore.getUserID()]);
    signalWindowReady();
});
</script>

<style scoped lang="scss">
@use "@/src/style/_constant.scss" as *;

.base-user-info {
    display: flex;
    flex-direction: column;
    align-items: center;
    // padding: $spacing-xl;
    min-height: 100%;
    box-sizing: border-box;

    .avatar-section {
        display: flex;
        flex-direction: column;
        align-items: center;
        margin-bottom: $spacing-xl;

        .user-name {
            margin-top: $spacing-md;
            font-size: $font-size-xl;
            font-weight: $font-weight-semibold;
            color: $color-text-primary;
        }

        .user-signature {
            margin-top: $spacing-xs;
            font-size: $font-size-sm;
            color: $color-text-secondary;
            max-width: 200px;
            text-align: center;
            word-break: break-word;
        }
    }

    .info-cards {
        width: 100%;
        max-width: 400px;
        display: flex;
        flex-direction: column;
        gap: $spacing-md;

        .info-card {
            background: $bg-card;
            border-radius: 12px;
            padding: $spacing-md $spacing-lg;
            border: 1px solid $color-border;

            .card-title {
                font-size: $font-size-base;
                font-weight: $font-weight-medium;
                color: $color-text-primary;
                margin-bottom: $spacing-md;
                padding-bottom: $spacing-sm;
                border-bottom: 1px solid $color-border;
            }

            .info-row {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                padding: $spacing-sm 0;

                .label {
                    font-size: $font-size-sm;
                    color: $color-text-secondary;
                    flex-shrink: 0;
                }

                .value {
                    font-size: $font-size-sm;
                    color: $color-text-primary;
                    text-align: right;
                    word-break: break-word;
                    max-width: 60%;

                    &.signature {
                        max-width: 180px;
                    }
                }
            }
        }
    }

    .action-buttons {
        margin-top: $spacing-xl;
        display: flex;
        gap: $spacing-md;
        width: 100%;
        max-width: 400px;

        :deep(.cus-button) {
            flex: 1;
            height: 44px !important;
            border-radius: 10px !important;
        }
    }
}

/* Modal Styles */
.modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: $bg-overlay;
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
}

.modal-card {
    background: $bg-card;
    border-radius: 16px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
    width: 320px;
    max-width: 90vw;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: modal-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.modal-header {
    padding: $spacing-md $spacing-lg;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid $color-border;
    background-color: $bg-body;

    span {
        font-size: $font-size-lg;
        font-weight: $font-weight-semibold;
        color: $color-text-primary;
    }

    .close-btn {
        border: none;
        background: none;
        font-size: 24px;
        color: $color-text-placeholder;
        cursor: pointer;
        line-height: 1;
        padding: 0;
        transition: color $transition-base;

        &:hover {
            color: $color-text-secondary;
        }
    }
}

.modal-body {
    padding: $spacing-lg;
    background: $bg-card;
    display: flex;
    flex-direction: column;
    gap: $spacing-md;

    .form-item {
        display: flex;
        flex-direction: column;
        gap: 8px;

        &.row-layout {
            flex-direction: row;
            justify-content: space-between;
            align-items: center;
            padding: 4px 0;

            label {
                margin-bottom: 0;
            }
        }

        label {
            font-size: $font-size-sm;
            color: $color-text-secondary;
        }

        input[type="text"],
        select,
        textarea {
            padding: 8px 12px;
            border-radius: 8px;
            border: 1px solid $color-border;
            background: $bg-body;
            color: $color-text-primary;
            font-size: $font-size-base;
            outline: none;
            transition: border-color $transition-base;

            &:focus {
                border-color: $color-primary;
            }
        }

        textarea {
            resize: none;
        }

        .radio-group {
            display: flex;
            gap: $spacing-lg;

            .radio-label {
                display: flex;
                align-items: center;
                gap: 6px;
                cursor: pointer;
                font-size: $font-size-base;
                color: $color-text-primary;

                input[type="radio"] {
                    accent-color: $color-primary;
                }
            }
        }
    }
}

.modal-footer {
    padding: $spacing-md $spacing-lg;
    display: flex;
    justify-content: flex-end;
    gap: $spacing-md;
    border-top: 1px solid $color-border;
    background-color: $bg-body;

    :deep(.cus-button) {
        min-width: 80px;
        height: 36px !important;
        border-radius: 8px !important;
        font-size: 14px !important;
    }
}

@keyframes modal-in {
    from {
        opacity: 0;
        transform: scale(0.95) translateY(10px);
    }

    to {
        opacity: 1;
        transform: scale(1) translateY(0);
    }
}

// Vue Transition
.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.3s ease;

    .modal-card {
        transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;

    .modal-card {
        transform: scale(0.95);
    }
}
</style>
