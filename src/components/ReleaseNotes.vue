<template>
    <div class="release-notes">
        <div class="version-row">
            <span class="version-tag">v{{ version }}</span>
            <span v-if="currentVersion" class="current-version">当前版本 v{{ currentVersion }}</span>
        </div>
        <!-- 按纯文本展示（主进程已剥掉 HTML），不走 v-html -->
        <div class="notes" :style="{ maxHeight }">{{ notes || '本次更新包含问题修复与体验优化。' }}</div>
    </div>
</template>

<script setup lang="ts">
/**
 * 新版本信息：版本号 + 更新说明。
 * 更新提示框（CusDialog 内容区）与更新窗口共用。
 */
withDefaults(defineProps<{
    version: string
    currentVersion?: string
    notes?: string
    /** 说明区最大高度，超出滚动 */
    maxHeight?: string
}>(), {
    currentVersion: '',
    notes: '',
    maxHeight: '180px',
})
</script>

<style scoped lang="scss">
@use "@/src/style/_constant.scss" as *;

.release-notes {
    display: flex;
    flex-direction: column;
    gap: 10px;

    .version-row {
        display: flex;
        align-items: center;
        gap: 10px;

        .version-tag {
            padding: 2px 10px;
            border-radius: 999px;
            font-size: 13px;
            font-weight: 600;
            background: $color-primary-bg;
            color: $color-primary;
        }

        .current-version {
            font-size: 12px;
            color: $color-text-secondary;
        }
    }

    .notes {
        overflow-y: auto;
        padding: 10px 12px;
        border-radius: var(--radius-md, 8px);
        border: 1px solid $color-border-divider;
        background: $bg-body;
        font-size: 13px;
        line-height: 1.6;
        color: $color-text-primary;
        white-space: pre-wrap;
        word-break: break-word;
        // 窗口整体是拖拽区，说明区要能滚动、能选中复制
        -webkit-app-region: no-drag;
        user-select: text;
    }
}
</style>
