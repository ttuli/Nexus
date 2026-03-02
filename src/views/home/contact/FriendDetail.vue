<template>
    <div class="friend-detail">
        <TitleBar :title="title" :need-min="false" :need-max="false" />
        <div class="content" v-if="userInfo">
            <div class="user-card">
                <!-- Cover Background -->
                <div class="card-cover"></div>

                <div class="card-body">
                    <div class="avatar-section">
                        <div class="avatar-wrapper">
                            <Avatar :uid="userInfo.user_id" class="user-avatar" />
                        </div>
                    </div>

                    <div class="info-section">
                        <div class="name-row">
                            <span class="remark">{{ displayName }}</span>
                            <img :src="MaleIcon" class="gender-icon" v-if="userInfo.gender === ImTypes.Gender.GENDER_MALE" />
                            <img :src="FemaleIcon" class="gender-icon" v-if="userInfo.gender === ImTypes.Gender.GENDER_FEMALE" />
                        </div>
                        <div class="sub-info">
                            <span class="nickname" v-if="friendInfo?.remark">昵称: {{ userInfo.user_name }}</span>
                            <span class="id-tag">
                                ID: {{ userInfo.user_id }}
                                <i class="copy-icon" @click="handleCopy(String(userInfo.user_id))">❐</i>
                            </span>
                        </div>
                    </div>

                    <div class="divider"></div>

                    <div class="detail-list">
                        <div class="detail-item">
                            <div class="item-icon">📱</div>
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
                            <div class="item-icon">✍️</div>
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
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useUserStore } from '@/store/user';
import { generateSessionId } from '@/utils/chat';
import { useChatStore } from '@/store/chat';
import MaleIcon from '@/assets/gender/male.svg';
import FemaleIcon from '@/assets/gender/female.svg';
import { ImTypes } from '@/types';
import { ElMessage } from 'element-plus';
import { userService } from '@/services';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const chatStore = useChatStore();

const userId = computed(() => Number(route.query.uid));
const userInfo = computed(() => userStore.getUser(userId.value));
const friendInfo = computed(() => userStore.getFriend(userId.value));
const displayName = computed(() => {
    return friendInfo.value?.remark || userInfo.value?.user_name || '用户';
});

const title = computed(() => displayName.value);

const handleCopy = async (text: string) => {
    try {
        await navigator.clipboard.writeText(text);
        ElMessage.success('复制成功');
    } catch (err) {
        ElMessage.error('复制失败');
    }
};


// ... (inside script setup)

const sendMsg = () => {
    const sessionId = generateSessionId(userId.value, userStore.getUserID());
    chatStore.setCurrentChat(sessionId);
    router.push('/home/chat');
};

onMounted(() => {
    userService.fetchByIds([userId.value],true);
})
</script>

<style scoped lang="scss">
@use "@/style/_constant.scss" as *;

.friend-detail {
    height: 100%;
    display: flex;
    flex-direction: column;
    position: relative;
    overflow: hidden;

    &::before {
        content: '';
        position: absolute;
        top: -20%;
        left: -10%;
        width: 60%;
        height: 50%;
        background: radial-gradient(circle, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0) 70%);
        filter: blur(60px);
        z-index: 0;
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
        max-width: 420px;
        display: flex;
        flex-direction: column;
        align-items: center;
        /* Removed card casing */

        // Hidden cover for this layout, or reused as specific background?
        // Let's remove the card-cover logic and rely on the page background
        .card-cover {
            display: none;
        }

        .card-body {
            width: 100%;
            padding: 0;
            display: flex;
            flex-direction: column;
            align-items: center;

            .avatar-section {
                margin-top: 20px;
                margin-bottom: 24px;
                position: relative;
                -webkit-app-region: no-drag;

                .avatar-wrapper {
                    padding: 6px;
                    background: rgba(255, 255, 255, 0.3);
                    backdrop-filter: blur(10px);
                    border-radius: 50%;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);

                    .user-avatar {
                        width: 100px;
                        height: 100px;
                        border-radius: 50%;
                        object-fit: cover;
                        cursor: pointer;
                        display: block;
                        transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);

                        &:hover {
                            transform: scale(1.08) rotate(3deg);
                        }
                    }
                }
            }

            .info-section {
                text-align: center;
                margin-bottom: 30px;
                width: 100%;
                color: #2c3e50;

                .name-row {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 10px;
                    margin-bottom: 8px;

                    .remark {
                        font-family: 'PingFang SC', sans-serif;
                        font-size: 26px;
                        font-weight: 800;
                        color: #2c3e50;
                        text-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
                    }

                    .gender-icon {
                        width: 20px;
                        height: 20px;
                        filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));
                    }
                }

                .sub-info {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;

                    .nickname {
                        font-size: 14px;
                        font-weight: 500;
                        opacity: 0.7;
                    }

                    .id-tag {
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
                        gap: 6px;
                        font-size: 13px;
                        opacity: 0.8;
                        background: rgba(255, 255, 255, 0.25);
                        padding: 4px 12px;
                        border-radius: 20px;
                        margin: 4px auto 0;
                        border: 1px solid rgba(255, 255, 255, 0.2);

                        .copy-icon {
                            font-style: normal;
                            cursor: pointer;
                            font-size: 12px;
                            transition: all 0.2s;
                            -webkit-app-region: no-drag;

                            &:hover {
                                transform: scale(1.2);
                                color: $color-primary;
                            }
                        }
                    }
                }
            }

            .divider {
                display: none; // No divider in open layout
            }

            .detail-list {
                width: 100%;
                display: flex;
                flex-direction: column;
                gap: 12px;
                margin-bottom: 40px;

                .detail-item {
                    display: flex;
                    align-items: center;
                    background: rgba(255, 255, 255, 0.45);
                    backdrop-filter: blur(12px);
                    padding: 16px 20px;
                    border-radius: 16px;
                    border: 1px solid rgba(255, 255, 255, 0.4);
                    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.02);
                    transition: all 0.3s ease;
                    -webkit-app-region: no-drag;

                    &:hover {
                        background: rgba(255, 255, 255, 0.65);
                        transform: translateY(-2px);
                        box-shadow: 0 8px 25px rgba(0, 0, 0, 0.05);
                    }

                    .item-icon {
                        font-size: 20px;
                        width: 36px;
                        height: 36px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        background: rgba(255, 255, 255, 0.5);
                        border-radius: 10px;
                        margin-right: 16px;
                    }

                    .item-content {
                        flex: 1;
                        display: flex;
                        flex-direction: column;
                        gap: 2px;

                        .label {
                            font-size: 11px;
                            text-transform: uppercase;
                            letter-spacing: 0.5px;
                            color: #666;
                            font-weight: 600;
                        }

                        .value-row {
                            display: flex;
                            align-items: center;
                            justify-content: space-between;

                            .value {
                                font-size: 15px;
                                font-weight: 600;
                                color: #2c3e50;
                            }

                            .copy-link {
                                font-size: 12px;
                                font-weight: 600;
                                color: $color-primary;
                                background: rgba($color-primary, 0.1);
                                padding: 2px 8px;
                                border-radius: 6px;
                                cursor: pointer;
                                transition: all 0.2s;

                                &:hover {
                                    background: $color-primary;
                                    color: white;
                                }
                            }
                        }

                        .value {
                            font-size: 15px;
                            font-weight: 600;
                            color: #2c3e50;
                            line-height: 1.5;

                            &.signature {
                                font-weight: 500;
                                font-style: italic;
                                opacity: 0.8;
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
                    max-width: 280px;
                    height: 54px;
                    font-size: 18px;
                    border-radius: 27px;
                    font-weight: 600;
                    letter-spacing: 1px;
                    background: #2c3e50; // Dark contrast button
                    border: none;
                    box-shadow: 0 10px 30px rgba(44, 62, 80, 0.3);
                    transition: all 0.3s;

                    &:hover {
                        transform: translateY(-2px);
                        box-shadow: 0 15px 35px rgba(44, 62, 80, 0.4);
                        background: #1a252f;
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
        color: #666;
        gap: 12px;

        .spinner {
            width: 32px;
            height: 32px;
            border: 3px solid rgba(0, 0, 0, 0.1);
            border-top-color: #2c3e50;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
        }
    }
}

@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}
</style>
