<template>
    <div v-if="hasOpened" v-show="visible" class="emoji-picker-overlay" @click.self="$emit('close')">
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
import { computed, ref, watch } from 'vue';

const props = defineProps<{
    visible: boolean;
    triggerRect: DOMRect | null;
}>();

const emit = defineEmits(['select', 'close']);

// 首次打开前不挂载，打开过之后就常驻 DOM，仅靠 v-show 切换显隐。
//
// 原来用 v-if，每次开关都要重建 191 个节点、重算样式、并重新栅格化 191 个彩色
// emoji 字形（Windows 上走 Segoe UI Emoji 的彩色字形，这步相当贵）——这是点开
// 表情框卡顿的主因。改成只付一次代价，之后开关就只是改一个 display。
const hasOpened = ref(false);
watch(
    () => props.visible,
    (v) => {
        if (v) hasOpened.value = true;
    },
    { immediate: true }
);

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
            user-select: none;

            /* 只过渡真正会变的两个属性。写 all 会让浏览器为这 191 个元素逐个跟踪
               每一项可动画属性，鼠标划过网格时样式重算成本被成倍放大 */
            transition: background-color 0.15s ease-out, transform 0.15s ease-out;

            /* 容器高 260px，一次只露出约 6 行（48 个），其余 143 个在滚动区外。
               加上这两行后，屏幕外的格子会跳过绘制与字形栅格化，滚动到才渲染。
               尺寸与下面写死的 32×32 一致，不会产生滚动条跳动 */
            content-visibility: auto;
            contain-intrinsic-size: 32px 32px;

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
