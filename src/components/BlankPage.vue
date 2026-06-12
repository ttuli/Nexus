<template>
    <div class="blank-page">
        <img :src="BlankIcon" alt="" class="icon">
    </div>
</template>

<script lang="ts" setup>
const BlankIcon = '/icon/icon_' + import.meta.env.VITE_ICON_VERSION + '-decolor.png'

defineOptions({ name: 'BlankPage' })
</script>

<style scoped lang="scss">
@use "@/src/style/_constant.scss" as *;

.blank-page {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    height: 100%;
    width: 100%;
    background-color: #f7f7f7;
    color: $color-text-placeholder;
    -webkit-app-region: no-drag;

    .icon {
        width: 200px;
        height: 200px;
        pointer-events: none;
    }
}
</style>
