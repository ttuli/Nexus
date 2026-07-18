<template>
    <div class="user-info-display">
        <!-- Full Screen Background Canvas -->
        <div class="background-canvas" :style="backgroundStyle"></div>
        <div class="background-overlay"></div>

        <!-- Main Content -->
        <div class="content-wrapper">
            <div class="header">
                <div class="back-btn" @click="handleBack" v-if="showBack">
                    <el-icon>
                        <ArrowLeft />
                    </el-icon>
                </div>
            </div>

            <div class="info-card" v-if="userInfo">
                <div class="avatar-container">
                    <Avatar :uid="userInfo.user_id" :size="120" class="main-avatar" />
                </div>

                <div class="text-info">
                    <h1 class="user-name">
                        {{ displayName }}
                        <img v-if="userInfo.gender === (ImTypes.Gender.GENDER_MALE as number)" :src="MaleIcon" class="gender-icon" />
                        <img v-else-if="userInfo.gender === (ImTypes.Gender.GENDER_FEMALE as number)" :src="FemaleIcon"
                            class="gender-icon" />
                    </h1>
                    <div class="user-id" @click="copyId">
                        <span>ID: {{ userInfo.user_id }}</span>
                        <el-icon class="copy-icon">
                            <CopyDocument />
                        </el-icon>
                    </div>
                    <div class="signature">
                        {{ userInfo.personal_signature || '这个人很懒，什么都没写~' }}
                    </div>
                </div>

                <div class="details-grid">
                    <div class="detail-item" v-if="userInfo.phone">
                        <span class="label">手机</span>
                        <span class="value">{{ userInfo.phone }}</span>
                    </div>
                    <div class="detail-item">
                        <span class="label">加入方式</span>
                        <span class="value">{{ joinTypeLabel }}</span>
                    </div>
                </div>

                <div class="actions">
                    <template v-if="isMe">
                        <CusButton class="action-btn" type="primary" @click="toEdit">编辑资料</CusButton>
                    </template>
                    <template v-else-if="isFriend">
                        <CusButton class="action-btn" type="primary" @click="toChat">发消息</CusButton>
                        <CusButton class="action-btn normal-btn" @click="toVoice">语音通话</CusButton>
                    </template>
                    <template v-else>
                        <CusButton class="action-btn" type="primary" @click="toAdd">添加好友</CusButton>
                    </template>
                </div>
            </div>

            <div v-else class="loading-state">
                <div class="spinner"></div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useUserStore } from '@/src/store/user';
import { generateSessionId } from '@/src/utils/sessionUtils';
import { useChatNavigation } from '@/src/composables/useChatNavigation';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { ArrowLeft, CopyDocument } from '@element-plus/icons-vue';
import MaleIcon from '@/src/assets/gender/male.svg';
import FemaleIcon from '@/src/assets/gender/female.svg';
import { ImTypes } from '@shared/types';

const props = defineProps<{
    userId: number;
    showBack?: boolean;
}>();

const emit = defineEmits<{
    (e: 'back'): void;
}>();

const userStore = useUserStore();
const { navigateToChat } = useChatNavigation();
const router = useRouter();

const userInfo = computed(() => userStore.getUser(props.userId));
const friendInfo = computed(() => userStore.getFriend(props.userId));
const isMe = computed(() => userStore.userID === props.userId);
const isFriend = computed(() => !!friendInfo.value);

const displayName = computed(() => {
    
    return friendInfo.value?.remark || userInfo.value?.user_name || `User ${props.userId}`;
});

const backgroundStyle = computed(() => {
    const url = userInfo.value?.avatar || '';
    // If no avatar, maybe use a default pattern or color
    return url ? { backgroundImage: `url(${url})` } : { backgroundColor: '#2c3e50' };
});

const joinTypeLabel = computed(() => {
    return Number(userInfo.value?.join_type) === ImTypes.JoinType.JOIN_TYPE_DIRECT ? '直接加入' : '需要验证';
});

const handleBack = () => {
    emit('back');
};

const copyId = async () => {
    try {
        await navigator.clipboard.writeText(String(props.userId));
        ElMessage.success('ID已复制');
    } catch (e) {
        ElMessage.error('复制失败');
    }
};

const toChat = () => {
    const sessionId = generateSessionId(props.userId, userStore.getUserID());
    navigateToChat(sessionId);
    router.push('/home/chat');
};

const toVoice = () => {
    ElMessage.info('语音通话功能开发中');
};

const toAdd = () => {
    // Navigate to add friend or show dialog
    // For now, check if search page handles generic adding or if we need a dialog here
    // Usually repurpose AddFriend logic or emit event
    router.push('/addFriend');
};

const toEdit = () => {
    router.push('/userInfo');
};
</script>

<style scoped lang="scss">
@use "@/src/style/_constant.scss" as *;

.user-info-display {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    color: #fff;
    font-family: $font-family-base;
}

.background-canvas {
    position: absolute;
    top: -10%;
    left: -10%;
    width: 120%;
    height: 120%;
    background-size: cover;
    background-position: center;
    filter: blur(60px) brightness(0.6);
    z-index: 0;
    transition: background-image 0.5s ease;
}

.background-overlay {
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at center, rgba(0, 0, 0, 0.1) 0%, rgba(0, 0, 0, 0.6) 100%);
    z-index: 1;
}

.content-wrapper {
    position: relative;
    z-index: 10;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow-y: auto;

    &::-webkit-scrollbar {
        width: 0;
        display: none;
    }
}

.header {
    padding: 20px;
    display: flex;
    align-items: center;
    height: 60px;
    box-sizing: border-box;

    .back-btn {
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(10px);
        cursor: pointer;
        transition: all 0.3s;
        font-size: 20px;

        &:hover {
            background: rgba(255, 255, 255, 0.2);
        }
    }
}

.info-card {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center; // Center vertically
    padding: 0 20px 40px;
    gap: 30px;
    animation: fadeIn 0.5s ease;
    max-width: 600px;
    margin: 0 auto;
    width: 100%;
    box-sizing: border-box;
}

.avatar-container {
    .main-avatar {
        border: 4px solid rgba(255, 255, 255, 0.2);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        border-radius: 50%;
    }
}

.text-info {
    text-align: center;

    .user-name {
        font-size: 32px;
        font-weight: 700;
        margin: 0 0 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);

        .gender-icon {
            width: 24px;
            height: 24px;
        }
    }

    .user-id {
        font-size: 14px;
        color: rgba(255, 255, 255, 0.7);
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: rgba(0, 0, 0, 0.2);
        padding: 4px 12px;
        border-radius: 20px;
        cursor: pointer;
        transition: all 0.2s;
        margin-bottom: 16px;

        &:hover {
            background: rgba(0, 0, 0, 0.4);
            color: #fff;
        }
    }

    .signature {
        font-size: 16px;
        color: rgba(255, 255, 255, 0.9);
        font-style: italic;
        max-width: 80%;
        margin: 0 auto;
        line-height: 1.5;
    }
}

.details-grid {
    display: flex;
    gap: 20px;
    flex-wrap: wrap;
    justify-content: center;
    width: 100%;

    .detail-item {
        background: rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(12px);
        padding: 12px 24px;
        border-radius: 16px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        min-width: 100px;
        border: 1px solid rgba(255, 255, 255, 0.1);

        .label {
            font-size: 12px;
            color: rgba(255, 255, 255, 0.6);
            text-transform: uppercase;
        }

        .value {
            font-size: 16px;
            font-weight: 600;
        }
    }
}

.actions {
    display: flex;
    gap: 16px;
    margin-top: 20px;
    width: 100%;
    justify-content: center;

    .action-btn {
        width: 160px;
        height: 50px;
        font-size: 16px;
        border-radius: 25px;
        box-shadow: 0 10px 20px rgba(0, 0, 0, 0.2);

        &.normal-btn {
            background: rgba(255, 255, 255, 0.15);
            color: white;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.1);

            &:hover {
                background: rgba(255, 255, 255, 0.25);
            }
        }
    }
}

.loading-state {
    display: flex;
    height: 100%;
    align-items: center;
    justify-content: center;

    .spinner {
        width: 40px;
        height: 40px;
        border: 3px solid rgba(255, 255, 255, 0.3);
        border-top-color: #fff;
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }
}

@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}

@keyframes fadeIn {
    from {
        opacity: 0;
        transform: translateY(20px);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
}
</style>
