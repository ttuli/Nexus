<template>
    <div class="chat-input-area">
        <div class="disabled-overlay" v-if="disableReason">
            {{ disableReason }}
        </div>

        <!-- 顶部工具栏 -->
        <div class="toolbar">
            <el-tooltip content="表情" placement="top" :show-after="500">
                <div class="icon-wrapper" ref="emojiBtnRef" @click="toggleEmojiPicker">
                    <Smileys class="app-icon app-icon--md app-icon--btn" />
                </div>
            </el-tooltip>

            <el-tooltip content="图片" placement="top" :show-after="500">
                <div class="icon-wrapper" @click="triggerImageSelect">
                    <Image class="app-icon app-icon--md app-icon--btn" />
                </div>
            </el-tooltip>

            <el-tooltip content="文件" placement="top" :show-after="500">
                <div class="icon-wrapper" @click="triggerFileSelect">
                    <Document class="app-icon app-icon--md app-icon--btn" />
                </div>
            </el-tooltip>

            <el-tooltip content="AI建议" placement="top" :show-after="500">
                <div class="icon-wrapper" @click="emit('triggerAi')">
                    <Lightbulb class="app-icon app-icon--md app-icon--btn bulb" />
                </div>
            </el-tooltip>

            <input type="file" ref="imageInputRef" accept=".jpg,.jpeg,.png,.gif,.bmp,.webp" style="display: none"
                @change="handleImageSelect">
            <input type="file" ref="fileInputRef" style="display: none" @change="handleFileSelect">
        </div>

        <EmojiPicker :visible="emojiPickerVisible" :trigger-rect="emojiTriggerRect" @select="onEmojiSelect"
            @close="emojiPickerVisible = false" />

        <!-- 独立封装的富文本输入组件 -->
        <div class="input-wrapper">
            <RichEditor 
                ref="richEditorRef" 
                @sendText="emit('send', $event)"
                @sendImage="emit('sendImage', $event)"
                @sendFile="emit('sendFile', $event)" 
            />
        </div>

        <!-- 底部操作栏 -->
        <div class="actions">
            <span class="tip">Enter 发送，Ctrl+Enter 换行</span>
            <CusButton type="primary" :show-icon="false" class="send-btn" @click="richEditorRef?.submit()">
                发送
            </CusButton>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import EmojiPicker from './components/EmojiPicker.vue';
import RichEditor from './components/RichEditor.vue';
import { ElMessage } from 'element-plus';
import { Smileys, Image, Document, Lightbulb } from 'reicon-vue';

withDefaults(defineProps<{
    disableReason?: string;
}>(), {
    disableReason: ''
});

const emit = defineEmits<{
    (e: 'send', content: string): void;
    (e: 'sendImage', file: File): void;
    (e: 'sendFile', file: File): void;
    (e: 'triggerAi'): void;
}>();

const richEditorRef = ref<InstanceType<typeof RichEditor> | null>(null);

// 表情选择
const emojiPickerVisible = ref(false);
const emojiBtnRef = ref<HTMLElement | null>(null);
const emojiTriggerRect = ref<DOMRect | null>(null);

const toggleEmojiPicker = () => {
    if (emojiBtnRef.value) {
        emojiTriggerRect.value = emojiBtnRef.value.getBoundingClientRect();
    }
    emojiPickerVisible.value = !emojiPickerVisible.value;
};

const onEmojiSelect = (emoji: string) => {
    richEditorRef.value?.insertText(emoji);
    emojiPickerVisible.value = false;
};

// 文件/图片选择
const imageInputRef = ref<HTMLInputElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const ALLOWED_IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];

const triggerImageSelect = () => {
    imageInputRef.value?.click();
};

const triggerFileSelect = () => {
    fileInputRef.value?.click();
};

const handleImageSelect = (event: Event) => {
    const target = event.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
        const file = target.files[0];
        const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
        if (!ALLOWED_IMAGE_EXTS.includes(ext)) {
            ElMessage.error('仅支持 jpg、png、gif、bmp、webp 格式的图片');
            target.value = '';
            return;
        }
        richEditorRef.value?.insertImage(file);
    }
    target.value = '';
};

const handleFileSelect = (event: Event) => {
    const target = event.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
        emit('sendFile', target.files[0]);
    }
    target.value = '';
};

defineExpose({
    insertText: (text: string) => richEditorRef.value?.insertText(text),
    insertImage: (file: File) => richEditorRef.value?.insertImage(file),
    clear: () => richEditorRef.value?.clear(),
    focus: () => richEditorRef.value?.focus()
});
</script>

<style scoped lang="scss">
@use "@/src/style/_constant.scss" as *;

.chat-input-area {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    background-color: var(--surface-default, #ffffff);
    padding: 8px 16px;
    box-sizing: border-box;
    position: relative;

    .disabled-overlay {
        position: absolute;
        inset: 0;
        background-color: rgba(255, 255, 255, 0.8);
        z-index: 10;
        display: flex;
        align-items: center;
        justify-content: center;
        color: $color-error;
        font-size: 14px;
        backdrop-filter: blur(2px);

        [data-theme='dark'] & {
            background-color: rgba(30, 41, 59, 0.8);
        }
    }

    .toolbar {
        display: flex;
        gap: 16px;
        margin-bottom: 8px;
        padding-left: 4px;
        color: var(--text-secondary);

        .icon-wrapper {
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;

            .app-icon {
                color: var(--text-secondary);
                transition: color 0.2s ease, transform 0.2s ease;

                &:hover {
                    color: $color-primary;
                }
            }
        }

        .bulb {
            margin-top: -4px;
        }
    }

    .input-wrapper {
        flex: 1;
        overflow: hidden;
    }

    .actions {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        margin-top: 8px;

        .tip {
            font-size: 12px;
            color: $color-text-placeholder;
            margin-right: 12px;
        }

        .send-btn {
            width: 80px;
            height: 32px;
            font-size: 13px;
            border-radius: 6px;
        }
    }
}
</style>
