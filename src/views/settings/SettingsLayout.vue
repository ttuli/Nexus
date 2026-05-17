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
                <div class="setting-info">
                    <span class="label">资源存储路径</span>
                    <span class="path-display">{{ currentStoragePath }}</span>
                </div>
                <el-button @click="handleChangeStoragePath" type="primary" size="small">更改</el-button>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { getTheme, setTheme } from '@/utils/themeManager';
import { signalWindowReady } from '@/utils/windowReady';
import { ipcService } from '@/services/ipcService';
import { IpcChannels } from '@/types';
import { settingService } from '@/services';

const isDark = ref(getTheme() === 'dark');
const currentStoragePath = ref<string>('加载中...');

const handleThemeChange = (val: boolean) => {
    setTheme(val ? 'dark' : 'light');
}

const fetchStoragePath = async () => {
    try {
        currentStoragePath.value = await settingService.getStoragePath()
    } catch (e) {
        currentStoragePath.value = '获取失败';
    }
}

const handleChangeStoragePath = async () => {
    try {
        const res = await ipcService.invoke<string>(IpcChannels.SETTINGS_SELECT_STORAGE_PATH);
        if (res?.success && res.data) {
            currentStoragePath.value = res.data;
            ElMessage.success('存储路径修改成功，重启客户端后生效（不迁移现有数据）');
        } else if (res?.error && res.error !== 'User canceled') {
            ElMessage.error(res.error);
        }
    } catch (e) {
        ElMessage.error('无法更改路径');
    }
}
onMounted(() => {
    fetchStoragePath();
    signalWindowReady();
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

        .setting-info {
            display: flex;
            flex-direction: column;
            gap: 4px;

            .path-display {
                font-size: 12px;
                color: $color-text-secondary;
                user-select: text;
            }
        }
    }
}
</style>
