<template>
    <div class="settings-layout">
        <TitleBar :needMin="true" :needMax="true" :title="'设置'" />

        <div class="setting-group">
            <h3 class="group-title">外观</h3>
            <div class="setting-item">
                <span class="label">深色模式</span>
                <el-switch v-model="isDark" @change="handleThemeChange" active-text="开启" inactive-text="关闭" />
            </div>
            <div class="setting-item">
                <span class="label">测试对话框</span>
                <el-button @click="testDialog" type="primary" size="small">打开</el-button>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { getTheme, setTheme } from '@/utils/themeManager';
import CusDialog from '@/components/CusDialog/CusDialog';
import { DialogResult } from '@/components/CusDialog/types';
import { signalWindowReady } from '@/utils/windowReady';

const isDark = ref(getTheme() === 'dark');

const handleThemeChange = (val: boolean) => {
    setTheme(val ? 'dark' : 'light');
}

const testDialog = async () => {
    const result = await CusDialog.open({
        title: '测试对话框',
        content: '这是一个测试对话框，点击确定或取消。',
        showCancel: true,
        showClose: true
    });
    console.log('Dialog result:', result);
    if (result === DialogResult.Confirm) {
        console.log('User confirmed');
    } else if (result === DialogResult.Cancel) {
        console.log('User canceled');
    } else if (result === DialogResult.Close) {
        console.log('User closed');
    }
}
onMounted(() => {
    signalWindowReady()
})
</script>

<style scoped lang="scss">
@use "@/style/_constant.scss" as *;

.settings-layout {
    // padding: 40px;
    height: 100%;
    width: 100%;
    background-color: $bg-card; // Use theme variable
    color: $color-text-primary;
    box-sizing: border-box;

    .page-title {
        font-size: 24px;
        margin-bottom: 30px;
        color: $color-text-primary;
    }

    .setting-group {
        padding: 30px;
        -webkit-app-region: no-drag;

        .group-title {
            font-size: 16px;
            color: $color-text-secondary;
            margin-bottom: 16px;
        }
    }

    .setting-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 0;
        border-bottom: 1px solid $color-border;

        .label {
            font-size: 14px;
            color: $color-text-primary;
        }
    }
}
</style>
