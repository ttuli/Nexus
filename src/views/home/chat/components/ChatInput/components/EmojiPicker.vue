<template>
    <div v-if="visible" class="emoji-picker-overlay" @click.self="$emit('close')">
        <div class="emoji-picker-container" :style="positionStyle">
            <div class="emoji-list">
                <span v-for="(emoji, index) in emojiList" :key="index" class="emoji-item" @click="onSelect(emoji)">
                    {{ emoji }}
                </span>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
    visible: boolean;
    triggerRect: DOMRect | null;
}>();

const emit = defineEmits(['select', 'close']);

// A lightweight list of frequently used emojis
const emojiList = [
    "😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "😇", "🙂", "🙃", "😉", "😌", "😍", "🥰",
    "😘", "😗", "😙", "😚", "😋", "😛", "😝", "😜", "🤪", "🤨", "🧐", "🤓", "😎", "🤩", "🥳", "😏",
    "😒", "😞", "😔", "😟", "😕", "🙁", "☹️", "😣", "😖", "😫", "😩", "🥺", "😢", "😭", "😤", "😠",
    "😡", "🤬", "🤯", "😳", "🥵", "🥶", "😱", "😨", "😰", "😥", "😓", "🤗", "🤔", "🤭", "🤫", "🤥",
    "😶", "😐", "😑", "😬", "🙄", "😯", "😦", "😧", "😮", "😲", "🥱", "😴", "🤤", "😪", "😵", "🤐",
    "🥴", "🤢", "🤮", "🤧", "😷", "🤒", "🤕", "🤑", "🤠", "😈", "👿", "👹", "👺", "🤡", "💩", "👻",
    "💀", "☠️", "👽", "👾", "🤖", "🎃", "😺", "😸", "😹", "😻", "😼", "😽", "🙀", "😿", "😾",
    "👋", "🤚", "🖐️", "✋", "🖖", "👌", "🤏", "✌️", "🤞", "🤟", "🤘", "🤙", "👈", "👉", "👆", "🖕", "👇",
    "☝️", "👍", "👎", "✊", "👊", "🤛", "🤜", "👏", "🙌", "👐", "🤲", "🤝", "🙏", "✍️", "💅", "🤳", "💪",
    "🧠", "🫀", "🫁", "🦷", "🦴", "👀", "👁️", "👅", "👄", "💋", "🩸",
    "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❣️", "💕", "💞", "💓", "💗",
    "💖", "💘", "💝", "💟",
    "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐻‍❄️", "🐨", "🐯", "🦁", "🐮", "🐷", "🐸", "🐵"
];

const positionStyle = computed(() => {
    if (!props.triggerRect) return {};

    const left = props.triggerRect.left;
    const bottom = window.innerHeight - props.triggerRect.top + 10;

    return {
        position: 'absolute' as const,
        left: `${left}px`,
        bottom: `${bottom}px`,
        zIndex: 2000
    };
});

const onSelect = (emoji: string) => {
    emit('select', emoji);
};
</script>

<style scoped lang="scss">
@use "@/src/style/_constant.scss" as *;

.emoji-picker-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 1999;
}

.emoji-picker-container {
    background: $bg-card;
    border-radius: 8px;
    padding: 12px;
    width: 320px;
    height: 260px;
    box-shadow: var(--shadow-md);
    border: 1px solid $color-border;
    overflow-y: auto;

    /* Elegant smooth scrolling */
    scroll-behavior: smooth;

    /* Custom lightweight scrollbar */
    &::-webkit-scrollbar {
        width: 6px;
    }

    &::-webkit-scrollbar-thumb {
        background-color: var(--border-divider);
        border-radius: 3px;

        &:hover {
            background-color: var(--text-secondary);
        }
    }

    .emoji-list {
        display: grid;
        grid-template-columns: repeat(8, 1fr);
        gap: 6px;

        .emoji-item {
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 22px;
            width: 32px;
            height: 32px;
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.15s ease-out;
            user-select: none;

            &:hover {
                background-color: $bg-hover;
                transform: scale(1.15);
            }

            &:active {
                transform: scale(0.95);
            }
        }
    }
}
</style>
