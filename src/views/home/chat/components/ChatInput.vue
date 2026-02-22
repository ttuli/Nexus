<template>
    <div class="chat-input-area">
        <div class="toolbar">
            <!-- P1: Icons for Emoji, Image, File (Placeholders) -->
            <el-tooltip content="表情" placement="top" :show-after="500">
                <div class="icon-wrapper" ref="emojiBtnRef" @click="toggleEmojiPicker">
                    <img class="icon-btn" :src="emoji">
                </div>
            </el-tooltip>

            <el-tooltip content="图片" placement="top" :show-after="500">
                <div class="icon-wrapper">
                    <img class="icon-btn" :src="picture">
                </div>
            </el-tooltip>

            <el-tooltip content="文件" placement="top" :show-after="500">
                <div class="icon-wrapper">
                    <img class="icon-btn" :src="file">
                </div>
            </el-tooltip>
        </div>

        <EmojiPicker :visible="emojiPickerVisible" :trigger-rect="emojiTriggerRect" @select="onEmojiSelect"
            @close="emojiPickerVisible = false" />

        <div class="input-wrapper">
            <textarea ref="textareaRef" v-model="inputValue" class="input-field" placeholder="发送消息..."
                @keydown.enter.exact.prevent="handleSend" @keydown.ctrl.enter="handleNewLine"></textarea>
        </div>

        <div class="actions">
            <span class="tip">Enter 发送，Ctrl+Enter 换行</span>
            <button class="send-btn" @click="handleSend">
                发送
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue';
import EmojiPicker from './EmojiPicker.vue';

import emoji from '@/assets/chat/emoji.svg?url';
import picture from '@/assets/chat/picture.svg?url';
import file from '@/assets/chat/file.svg?url';

const inputValue = ref('');
const textareaRef = ref<HTMLTextAreaElement | null>(null);

// Emoji Picker Logic
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
    // Insert emoji at cursor position
    const textarea = textareaRef.value;
    if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        inputValue.value = inputValue.value.substring(0, start) + emoji + inputValue.value.substring(end);

        // Restore focus and cursor position
        nextTick(() => {
            textarea.focus();
            textarea.selectionStart = textarea.selectionEnd = start + emoji.length;
        });
    } else {
        inputValue.value += emoji;
    }
    emojiPickerVisible.value = false;
};

const emit = defineEmits<{
    (e: 'send', content: string): void;
}>();

const handleSend = () => {
    const content = inputValue.value.trim();
    if (!content) return;

    emit('send', content);
    inputValue.value = '';
};

const handleNewLine = () => {
    inputValue.value += '\n';
};
</script>

<style scoped lang="scss">
@use "@/style/_constant.scss" as *;

.chat-input-area {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    background-color: white;
    padding: 8px 16px;
    box-sizing: border-box;

    .toolbar {
        display: flex;
        gap: 16px;
        margin-bottom: 8px;
        padding-left: 4px;

        .icon-wrapper {
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
        }

        .icon-btn {
            width: 20px;
            height: 20px;
            cursor: pointer;
            opacity: 0.7;
            transition: opacity 0.2s, transform 0.2s;

            &:hover {
                opacity: 1;
                transform: scale(1.1);
            }
        }
    }

    .input-wrapper {
        flex: 1;
        overflow: hidden;

        .input-field {
            width: 100%;
            height: 100%;
            border: none;
            outline: none;
            resize: none;
            font-size: 14px;
            font-family: inherit;
            color: $color-text-primary;
            background: transparent;
            line-height: 1.5;

            &::placeholder {
                color: $color-text-placeholder;
            }
        }
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
            width: 100px;
            height: 35px;
            border-radius: 8px;
            border: none;
            background-color: $color-primary;
            color: white;
            cursor: pointer;
            font-size: 14px;
            transition: background-color 0.2s;

            &:hover {
                filter: brightness(0.9);
            }
        }
    }
}
</style>
