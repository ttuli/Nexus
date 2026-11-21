<template>
    <span>
        <template v-for="(segment, index) in segments" :key="index">
            <mark v-if="segment.hit" class="hit">{{ segment.text }}</mark>
            <span v-else>{{ segment.text }}</span>
        </template>
    </span>
</template>

<script setup lang="ts">
/**
 * 关键词高亮：把文本切成命中 / 未命中的片段逐段渲染。
 * 不拼 HTML（v-html），文本始终按纯文本输出，不会被当成标签解析
 */
import { computed } from 'vue';

const props = defineProps<{
    text: string;
    /** 要高亮的关键词；为空时原样显示 */
    keyword?: string;
}>();

/**
 * 只把 ASCII 大写转小写：与 SQLite LIKE 的大小写规则一致（搜得到的才高亮），
 * 而且不改变字符串长度，在转换后的串里找到的下标可以直接用来切原文
 */
const asciiLower = (text: string) => text.replace(/[A-Z]/g, ch => ch.toLowerCase());

const segments = computed(() => {
    const { text } = props;
    const word = props.keyword?.trim();
    if (!text || !word) return [{ text, hit: false }];

    const haystack = asciiLower(text);
    const needle = asciiLower(word);
    const result: { text: string; hit: boolean }[] = [];
    let from = 0;
    for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, from)) {
        if (at > from) result.push({ text: text.slice(from, at), hit: false });
        result.push({ text: text.slice(at, at + needle.length), hit: true });
        from = at + needle.length;
    }
    if (from < text.length) result.push({ text: text.slice(from), hit: false });
    return result;
});
</script>

<style scoped lang="scss">
.hit {
    background: none;
    color: $color-primary;
}
</style>
