<template>
    <div class="group-info-display">
        <div class="background-canvas" :style="backgroundStyle"></div>
        <div class="background-overlay"></div>

        <div class="content-wrapper">
            <div class="header">
                <div class="back-btn" @click="handleBack" v-if="showBack">
                    <el-icon>
                        <ArrowLeft />
                    </el-icon>
                </div>
            </div>

            <div class="info-card" v-if="groupInfo">
                <div class="avatar-container">
                    <Avatar :uid="groupInfo.id" type="group" :size="120" class="main-avatar" />
                </div>

                <div class="text-info">
                    <h1 class="group-name">
                        {{ groupInfo.name }}
                    </h1>
                    <div class="group-id" @click="copyId">
                        <span>群号: {{ groupInfo.id }}</span>
                        <el-icon class="copy-icon">
                            <CopyDocument />
                        </el-icon>
                    </div>
                    <div class="member-count">
                        <el-icon>
                            <User />
                        </el-icon>
                        <span>{{ groupInfo.member_count }} 人</span>
                    </div>
                </div>

                <div class="announcement-section">
                    <h3>群公告</h3>
                    <p>{{ '暂无公告' }}</p>
                    <!-- ImTypes.GroupInfo interface doesn't strictly have notice yet based on type definition, using placeholder or check if extended -->
                </div>

                <div class="actions">
                    <template v-if="isMember">
                        <CusButton class="action-btn" type="primary" @click="toChat">发消息</CusButton>
                    </template>
                    <template v-else>
                        <CusButton class="action-btn" type="primary" @click="toJoin">申请入群</CusButton>
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
import { computed, onMounted } from 'vue';
import { generateGroupSessionId } from '@/src/utils/sessionUtils';
import { useChatNavigation } from '@/src/composables/useChatNavigation';
import { useGroup } from '@/src/composables/useGroup';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { ArrowLeft, CopyDocument, User } from '@element-plus/icons-vue';


const props = defineProps<{
    groupId: number;
    showBack?: boolean;
}>();

const emit = defineEmits<{
    (e: 'back'): void;
}>();

const { navigateToChat } = useChatNavigation();
const router = useRouter();

const { groupInfo, isMember, loadInfo, copyGroupId: copyGroupIdToClipboard } = useGroup(() => props.groupId);

const backgroundStyle = computed(() => {
    const url = groupInfo.value?.avatar || '';
    return url ? { backgroundImage: `url(${url})` } : { backgroundColor: '#34495e' };
});

onMounted(() => {
    if (!groupInfo.value) {
        loadInfo();
    }
});

const handleBack = () => {
    emit('back');
};

const copyId = async () => {
    const ok = await copyGroupIdToClipboard();
    ok ? ElMessage.success('群号已复制') : ElMessage.error('复制失败');
};

const toChat = () => {
    const sessionId = generateGroupSessionId(props.groupId);
    navigateToChat(sessionId);
    router.push('/home/chat');
};

const toJoin = () => {
    // Integrate with AddFriend/Apply logic or show dialog
    // Since this component is likely used in Search, we might want to emit 'join'
    // But for standalone view, we might need internal logic.
    // For now, let's assume we can navigate to AddFriend with query or show a dialog.
    // Simplifying: just emit or show prompt.
    // Given the previous task refactoring, reusing AddFriend logic is best but it's a view.
    // Let's just say "Please search to join" or implement joinDialog here?
    // User requested "display info", actions are secondary but important.
    // I'll leave a placeholder or navigate to addFriend if possible.
    router.push('/addFriend');
};

</script>

<style scoped lang="scss">
@use "@/src/style/_constant.scss" as *;

.group-info-display {
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
    // slightly different gradient for groups
    background: linear-gradient(to top, rgba(0, 0, 0, 0.8), rgba(0, 0, 0, 0.2) 60%, rgba(0, 0, 0, 0.1));
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
    justify-content: center;
    padding: 0 20px 40px;
    gap: 30px;
    animation: fadeIn 0.5s ease;
    max-width: 600px;
    margin: 0 auto;
    width: 100%;
}

.avatar-container {
    .main-avatar {
        border: 4px solid rgba(255, 255, 255, 0.2);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        border-radius: 16px; // Squared logic for groups often
    }
}

.text-info {
    text-align: center;

    .group-name {
        font-size: 32px;
        font-weight: 700;
        margin: 0 0 10px;
        text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    }

    .group-id {
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
        margin-bottom: 12px;

        &:hover {
            background: rgba(0, 0, 0, 0.4);
            color: #fff;
        }
    }

    .member-count {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        font-size: 14px;
        color: rgba(255, 255, 255, 0.8);
        background: rgba(255, 255, 255, 0.1);
        padding: 4px 12px;
        border-radius: 12px;
        backdrop-filter: blur(5px);
    }
}

.announcement-section {
    background: rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(12px);
    padding: 24px;
    border-radius: 16px;
    width: 80%;
    max-width: 400px;
    border: 1px solid rgba(255, 255, 255, 0.1);

    h3 {
        margin: 0 0 12px;
        font-size: 16px;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.9);
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        padding-bottom: 8px;
    }

    p {
        margin: 0;
        font-size: 14px;
        color: rgba(255, 255, 255, 0.7);
        line-height: 1.6;
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
