<template>
    <div v-if="visible" class="emoji-picker-overlay" @click.self="$emit('close')">
        <div class="emoji-picker-container" :style="positionStyle">
            <EmojiPicker :native="true" @select="onSelect" :group-names="groupNames" :static-texts="staticTexts" />
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import EmojiPicker from 'vue3-emoji-picker';
import 'vue3-emoji-picker/css';

const props = defineProps<{
    visible: boolean;
    triggerRect: DOMRect | null;
}>();

const emit = defineEmits(['select', 'close']);

// Localization
const groupNames = {
    "smileys_people": "表情与人物",
    "animals_nature": "动物与自然",
    "food_drink": "食物与饮料",
    "activities": "活动",
    "travel_places": "旅行与地点",
    "objects": "物品",
    "symbols": "符号",
    "flags": "旗帜",
    "recent": "最近使用",
    "search": "搜索结果"
};

const staticTexts = {
    placeholder: "搜索表情...",
    skinTone: "肤色"
};

const positionStyle = computed(() => {
    if (!props.triggerRect) return {};

    // Position above the trigger, aligned left
    const left = props.triggerRect.left;
    const bottom = window.innerHeight - props.triggerRect.top + 10;

    return {
        position: 'absolute' as const,
        left: `${left}px`,
        bottom: `${bottom}px`,
        zIndex: 2000
    };
});

const onSelect = (emoji: any) => {
    emit('select', emoji.i);
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
    filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.15));

    :deep(.v3-emoji-picker) {
        --ep-color-bg: #ffffff;
        --ep-color-border: #e4e7ed;
        border-radius: 8px;
        height: 350px;
    }
}
</style>
