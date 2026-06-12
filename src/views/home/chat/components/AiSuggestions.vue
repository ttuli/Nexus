<template>
    <transition name="el-fade-in-linear">
        <div v-show="visible" class="ai-suggestions-widget">
            <div class="header">
                <span class="title">
                    <img class="icon" :src="bulbIcon" /> AI 建议回复
                </span>
                <div class="actions">
                    <!-- <el-checkbox v-model="autoGenerate" size="small"
                        style="margin-right: 12px; margin-bottom: 0;">自动生成</el-checkbox> -->
                    <span class="refresh-btn" @click="handleRegenerate" :class="{ 'is-loading': loading }"
                        style="margin-right: 12px;">
                        <el-icon>
                            <Refresh />
                        </el-icon> 重新生成
                    </span>
                    <span class="refresh-btn" @click="handleRefresh">
                        <el-icon>
                            <RefreshRight />
                        </el-icon> 换一批
                    </span>
                </div>
            </div>

            <div class="content">
                <div v-if="loading" class="loading-state">
                    <el-icon class="is-loading">
                        <Loading />
                    </el-icon> 正在生成建议...
                </div>
                <div v-else-if="allSuggestions.length === 0" class="loading-state">
                    暂无建议
                </div>
                <div v-else-if="error" class="error-state">
                    <span class="error-text">{{ error }}</span>
                </div>
                <div v-else class="suggestions-list">
                    <div v-for="(text, index) in suggestions" :key="index" class="suggestion-item"
                        @click="handleSelect(text)">
                        {{ text }}
                    </div>
                </div>
            </div>
            <div class="close-btn" @click="handleClose">
                <el-icon>
                    <Close />
                </el-icon>
            </div>
        </div>
    </transition>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { Refresh, RefreshRight, Loading, Close } from '@element-plus/icons-vue';
import bulbIcon from '@/src/assets/chat/bulb.svg?url';
import llmService from '@/src/services/llmService';
import { useChatStore } from '@/src/store/chat';
import { useUserStore } from '@/src/store/user';
import { Role } from '@/src/types/apis/llm/llm';
import { ImTypes } from '@/src/types';
import { ElMessage } from 'element-plus';

const props = defineProps<{
    visible: boolean;
}>();

const emit = defineEmits<{
    (e: 'select', text: string): void;
    (e: 'close'): void;
}>();

const chatStore = useChatStore();
const userStore = useUserStore();

const allSuggestions = ref<string[]>([]);
const pageIndex = ref(0);
const loading = ref(false);
const error = ref<string | null>(null);

const autoGenerate = ref(localStorage.getItem('ai_auto_suggest') === 'true');

watch(autoGenerate, (newVal) => {
    localStorage.setItem('ai_auto_suggest', newVal ? 'true' : 'false');
});

const suggestions = computed(() => {
    const start = pageIndex.value * 3;
    return allSuggestions.value.slice(start, start + 3);
});

const fetchAiSuggestions = async () => {
    loading.value = true;
    error.value = null;

    try {
        const messagesToSend = [];
        const msgLen = chatStore.messages.length;
        for (let i = msgLen - 1; i >= 0 && messagesToSend.length < 10; i--) {
            const msg = chatStore.messages[i];
            if (msg.type === ImTypes.MessageType.CHAT_TEXT || msg.type === ImTypes.MessageType.GROUP_TEXT) {
                const role = msg.fromUserId === userStore.userID ? Role.ROLE_ME : Role.ROLE_OTHER;
                messagesToSend.unshift({
                    role,
                    content: (msg as any).content
                });
            }
        }
        if (messagesToSend.length === 0) {
            ElMessage.error('没有对话记录');
            return;
        }

        let res = await llmService.suggest({
            history: messagesToSend
        });

        if (res && res.reply && res.reply.length > 0) {
            allSuggestions.value = res.reply;
        }
        pageIndex.value = 0;
    } catch (err) {
        error.value = '生成建议失败，请重试';
    } finally {
        loading.value = false;
    }
};

watch(() => props.visible, (newVal) => {
    if (newVal && allSuggestions.value.length === 0) {
        fetchAiSuggestions();
    }
});

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
watch(() => chatStore.messages.length, (newLen, oldLen) => {
    if (newLen > oldLen && props.visible && autoGenerate.value) {
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(() => {
            fetchAiSuggestions();
        }, 3000);
    }
});

const handleSelect = (text: string) => {
    emit('select', text);
};

const handleRefresh = () => {
    if (allSuggestions.value.length === 0) return;
    const maxPage = Math.ceil(allSuggestions.value.length / 3);
    pageIndex.value = (pageIndex.value + 1) % maxPage;
};

const handleRegenerate = () => {
    if (loading.value) return;
    fetchAiSuggestions();
};

const handleClose = () => {
    emit('close');
};
</script>

<style scoped lang="scss">
@use "@/src/style/_constant.scss" as *;

.ai-suggestions-widget {
    width: 100%;
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(10px);
    border-top: 1px solid $color-border;
    border-bottom: 1px solid $color-border;
    padding: 12px 16px;
    box-sizing: border-box;
    -webkit-app-region: no-drag;

    .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
        padding-right: 20px;
        /* space for close button */

        .title {
            display: flex;
            align-items: center;
            font-size: 13px;
            font-weight: 600;
            color: $color-text-primary;
            gap: 6px;

            .icon {
                width: 16px;
                height: 16px;
            }
        }

        .actions {
            display: flex;
            align-items: center;

            :deep(.el-checkbox) {
                --el-checkbox-text-color: #606266;
            }
        }

        .refresh-btn {
            display: flex;
            align-items: center;
            font-size: 12px;
            color: $color-primary;
            cursor: pointer;
            gap: 4px;
            user-select: none;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);

            &:hover {
                opacity: 0.8;
                transform: translateY(-1px);
            }
            
            &:active {
                transform: translateY(1px) scale(0.98);
            }

            .el-icon {
                transition: transform 0.3s;
            }

            &.is-loading .el-icon {
                animation: rotating 2s linear infinite;
            }
        }
    }

    .content {
        min-height: 50px;

        .loading-state,
        .error-state {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 60px;
            font-size: 13px;
            color: $color-text-placeholder;
            gap: 8px;
        }

        .error-state {
            color: #f56c6c;
            /* Default element-plus error color */
        }

        .suggestions-list {
            display: flex;
            flex-direction: column;
            gap: 8px;

            .suggestion-item {
                padding: 8px 12px;
                background-color: #f7f9fa;
                border-radius: 6px;
                font-size: 13px;
                color: $color-text-primary;
                cursor: pointer;
                transition: all 0.2s;
                line-height: 1.5;
                border: 1px solid transparent;

                &:hover {
                    background-color: $bg-hover;
                    color: $color-primary;
                    border-color: $color-border;
                }
            }
        }
    }

    .close-btn {
        position: absolute;
        top: 16px;
        right: 12px;
        cursor: pointer;
        color: $color-text-placeholder;
        font-size: 16px;
        transition: color 0.2s;

        &:hover {
            color: $color-text-primary;
        }
    }
}
</style>
