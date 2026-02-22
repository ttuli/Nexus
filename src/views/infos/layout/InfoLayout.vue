<template>
    <div class="info-layout">
        <div class="content-area">
            <TitleBar :needMax="false" :onClose="closeLogic" />
            <div class="scroll-container scroll-bar-normal">
                <slot></slot>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">

const closeLogic = () => {
    window.close();
}
</script>

<style scoped lang="scss">
@use "@/style/_constant.scss" as *;

.info-layout {
    display: flex;
    height: 100%;
    width: 100%;
    overflow: hidden;
    background: $bg-body;

    .content-area {
        flex: 1;
        height: 100%;
        min-width: 0;
        display: flex;
        flex-direction: column;

        .scroll-container {
            flex: 1;
            -webkit-app-region: no-drag;
            overflow: auto;
            position: relative;
        }
    }
}
</style>
