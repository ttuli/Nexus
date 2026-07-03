<template>
    <div class="settings-layout">
        <!-- Window Title Bar -->
        <TitleBar :needMin="true" :needMax="true" :title="'设置'" />

        <div class="settings-container">
            <!-- Left Navigation Sidebar -->
            <div class="settings-sidebar">
                <div 
                    class="nav-item" 
                    :class="{ active: activeTab === 'general' }" 
                    @click="activeTab = 'general'"
                >
                    <span class="icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                    </span>
                    <span class="nav-label">通用设置</span>
                </div>
                <div 
                    class="nav-item" 
                    :class="{ active: activeTab === 'about' }" 
                    @click="activeTab = 'about'"
                >
                    <span class="icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                    </span>
                    <span class="nav-label">关于 Nexus</span>
                </div>
            </div>

            <!-- Right Content Pane -->
            <div class="settings-content">
                <!-- General Settings Tab -->
                <div v-if="activeTab === 'general'" class="tab-pane">
                    <h2 class="section-title">通用设置</h2>
                    
                    <div class="setting-card-group">
                        <!-- Theme Toggle Card -->
                        <div class="setting-card">
                            <div class="card-left">
                                <div class="icon-wrapper theme-icon">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 14.7255 3.09032 17.1962 4.85857 19C5.03456 19.176 5.12256 19.264 5.1683 19.3732C5.21404 19.4824 5.21404 19.6083 5.21404 19.8601V20.5C5.21404 21.3284 5.88561 22 6.71404 22H12Z"/><circle cx="7.5" cy="10.5" r="1.5"/><circle cx="11.5" cy="7.5" r="1.5"/><circle cx="16.5" cy="9.5" r="1.5"/><circle cx="15.5" cy="14.5" r="1.5"/></svg>
                                </div>
                                <div class="setting-text">
                                    <span class="label">外观模式</span>
                                    <span class="description">调整客户端显示主题为浅色模式或深色模�?/span>
                                </div>
                            </div>
                            <div class="card-right">
                                <SkyToggle v-model="isDark" @change="handleThemeChange" size="13px" />
                            </div>
                        </div>

                        <!-- Storage Path Card -->
                        <div class="setting-card">
                            <div class="card-left">
                                <div class="icon-wrapper storage-icon">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                                </div>
                                <div class="setting-text">
                                    <span class="label">资源存储路径</span>
                                    <span class="description">接收和下载的文件都会保存在此目录下，点击路径即可复制</span>
                                    <div class="path-display" title="点击复制路径" @click="copyPath(currentStoragePath)">
                                        {{ currentStoragePath }}
                                    </div>
                                </div>
                            </div>
                            <div class="card-right">
                                <button class="action-btn" @click="handleChangeStoragePath">更改</button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- About Tab -->
                <div v-else-if="activeTab === 'about'" class="tab-pane about-pane">
                    <div class="about-logo-section">
                        <div class="app-logo">
                            <img :src="icon" alt="Nexus" @error="handleLogoError" />
                        </div>
                        <h1 class="app-name">Nexus IM</h1>
                        <p class="app-version">Version 1.0.0 (Build 260616)</p>
                    </div>

                    <div class="about-details">
                        <div class="info-row">
                            <span class="info-label">系统环境</span>
                            <span class="info-value">Electron + Vue 3 + TypeScript</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">核心支持</span>
                            <span class="info-value">Nexus Team</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">官方版权</span>
                            <span class="info-value">© 2026 Nexus. All rights reserved.</span>
                        </div>
                    </div>

                    <div class="about-actions">
                        <button class="text-action-btn" @click="checkUpdates">检查更�?/button>
                        <span class="divider">|</span>
                        <button class="text-action-btn" @click="viewLicense">服务条款</button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import SkyToggle from './components/SkyToggle.vue';
import { getTheme, setTheme } from '@/src/utils/themeManager';
import { signalWindowReady } from '@/src/utils/window';
import { ipcService } from '@/src/services/ipcService';
import { IpcChannels } from '@/src/types';
import { settingService } from '@/src/services';

const isDark = ref(getTheme() === 'dark');
const currentStoragePath = ref<string>('加载�?..');
const activeTab = ref<'general' | 'about'>('general');

// App Logo path resolving, fallback to a local app logo fallback if error
const icon = ref('/icon/icon_' + (import.meta.env.VITE_ICON_VERSION || '1') + '.png');

const handleLogoError = () => {
    // Fallback if logo file doesn't exist
    icon.value = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="%231890ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
};

const handleThemeChange = (val: boolean) => {
    setTheme(val ? 'dark' : 'light');
};

const fetchStoragePath = async () => {
    try {
        currentStoragePath.value = await settingService.getStoragePath();
    } catch (e) {
        currentStoragePath.value = '获取失败';
    }
};

const handleChangeStoragePath = async () => {
    try {
        const res = await ipcService.invoke<string>(IpcChannels.SETTINGS_SELECT_STORAGE_PATH);
        if (res?.success && res.data) {
            currentStoragePath.value = res.data;
            ElMessage.success('存储路径修改成功，重启客户端后生�?);
        } else if (res?.error && res.error !== 'User canceled') {
            ElMessage.error(res.error);
        }
    } catch (e) {
        ElMessage.error('无法更改路径');
    }
};

const copyPath = (path: string) => {
    if (!path || path === '加载�?..' || path === '获取失败') return;
    navigator.clipboard.writeText(path)
        .then(() => {
            ElMessage.success('路径已成功复�?);
        })
        .catch(() => {
            ElMessage.error('复制失败');
        });
};

const checkUpdates = () => {
    ElMessage.success('当前已是最新版�?);
};

const viewLicense = () => {
    ElMessage.info('服务条款：请遵守 Nexus 开源协议与本地法律法规');
};

onMounted(() => {
    fetchStoragePath();
    signalWindowReady();
});
</script>

<style scoped lang="scss">
@use "@/src/style/_constant.scss" as *;

.settings-layout {
    height: 100vh;
    width: 100vw;
    display: flex;
    flex-direction: column;
    background-color: $bg-body;
    color: $color-text-primary;
    box-sizing: border-box;
    overflow: hidden;
    user-select: none;
}

.settings-container {
    flex: 1;
    display: flex;
    flex-direction: row;
    height: calc(100% - 35px); // Titlebar offset
    overflow: hidden;
    -webkit-app-region: no-drag;
}

// Left Navigation Sidebar
.settings-sidebar {
    width: 200px;
    background-color: $bg-card;
    border-right: 1px solid $color-border;
    padding: $spacing-md;
    display: flex;
    flex-direction: column;
    gap: 4px;
    box-sizing: border-box;

    .nav-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 16px;
        border-radius: var(--radius-md, 8px);
        color: $color-text-secondary;
        cursor: pointer;
        font-weight: 500;
        font-size: 14px;
        transition: all $transition-base;

        .icon {
            display: flex;
            align-items: center;
            justify-content: center;
            transition: transform 0.2s ease;
        }

        &:hover {
            background-color: $bg-hover;
            color: $color-text-primary;

            .icon {
                transform: scale(1.08);
            }
        }

        &.active {
            background-color: $bg-active;
            color: $color-primary;
            font-weight: 600;

            .icon {
                color: $color-primary;
            }
        }
    }
}

// Right Content Panel
.settings-content {
    flex: 1;
    background-color: $bg-body;
    padding: $spacing-xl;
    overflow-y: auto;
    box-sizing: border-box;

    &::-webkit-scrollbar {
        width: 6px;
    }

    &::-webkit-scrollbar-thumb {
        background-color: rgba(0, 0, 0, 0.08);
        border-radius: 3px;
    }

    .tab-pane {
        max-width: 540px;
        margin: 0 auto;
        display: flex;
        flex-direction: column;
        gap: $spacing-lg;
    }
}

// Typography & Headers
.section-title {
    font-size: 18px;
    font-weight: 600;
    margin: 0 0 4px 0;
    color: $color-text-title;
}

// Cards styling
.setting-card-group {
    display: flex;
    flex-direction: column;
    gap: $spacing-md;
}

.setting-card {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background-color: $bg-card;
    border: 1px solid $color-border;
    border-radius: var(--radius-lg, 12px);
    padding: $spacing-md $spacing-lg;
    box-shadow: var(--shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.05));
    transition: all $transition-base;

    &:hover {
        border-color: var(--color-primary-light);
        box-shadow: var(--shadow-md, 0 4px 12px rgba(0, 0, 0, 0.05));
    }

    .card-left {
        display: flex;
        align-items: flex-start;
        gap: 16px;
        flex: 1;
        min-width: 0;
    }

    .icon-wrapper {
        width: 38px;
        height: 38px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        margin-top: 2px;

        &.theme-icon {
            background: linear-gradient(135deg, rgba(137, 104, 255, 0.12), rgba(137, 104, 255, 0.22));
            color: #8968FF;
        }

        &.storage-icon {
            background: linear-gradient(135deg, rgba(24, 144, 255, 0.12), rgba(24, 144, 255, 0.22));
            color: $color-primary;
        }
    }

    .setting-text {
        display: flex;
        flex-direction: column;
        gap: 4px;
        flex: 1;
        min-width: 0;

        .label {
            font-size: 14px;
            font-weight: 600;
            color: $color-text-primary;
        }

        .description {
            font-size: 12px;
            color: $color-text-secondary;
            line-height: 1.4;
        }
    }

    .card-right {
        margin-left: 16px;
        flex-shrink: 0;
    }
}

// Storage Path display
.path-display {
    display: inline-block;
    padding: 6px 12px;
    background-color: $bg-hover;
    border: 1px solid $color-border;
    border-radius: var(--radius-md, 6px);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 11px;
    color: $color-text-secondary;
    margin-top: 8px;
    cursor: pointer;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    transition: all 0.2s ease;
    box-sizing: border-box;

    &:hover {
        background-color: $bg-active;
        color: $color-primary;
        border-color: var(--color-primary-light);
    }
}

// Action button
.action-btn {
    background: var(--color-primary-bg);
    color: var(--color-primary);
    border: 1px solid var(--color-primary-light);
    padding: 6px 14px;
    font-size: 12px;
    font-weight: 600;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.25s cubic-bezier(0.25, 0.8, 0.25, 1);
    outline: none;

    &:hover {
        background: var(--color-primary);
        color: #fff;
        border-color: var(--color-primary);
        box-shadow: var(--shadow-primary);
    }

    &:active {
        transform: scale(0.96);
    }
}

// About Tab Specific Styling
.about-pane {
    align-items: center;
    text-align: center;
    padding-top: $spacing-lg;

    .about-logo-section {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        margin-bottom: $spacing-md;

        .app-logo {
            width: 72px;
            height: 72px;
            border-radius: 18px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, #e6eeff 0%, #E0F2FE 100%);
            box-shadow: var(--shadow-md, 0 4px 12px rgba(0, 0, 0, 0.08));
            padding: 8px;
            box-sizing: border-box;
            transition: all 0.5s ease;

            img {
                width: 100%;
                height: 100%;
                object-fit: contain;
            }

            &:hover {
                transform: rotate(10deg) scale(1.06);
                box-shadow: var(--shadow-card, 0 4px 20px rgba(0, 0, 0, 0.15));
            }
        }

        .app-name {
            font-size: 20px;
            font-weight: 700;
            background: linear-gradient(90deg, #2ba3fe 0%, #3252fc 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            margin: 4px 0 0 0;
        }

        .app-version {
            font-size: 12px;
            color: $color-text-secondary;
            margin: 0;
        }
    }

    .about-details {
        width: 100%;
        background-color: $bg-card;
        border: 1px solid $color-border;
        border-radius: var(--radius-lg, 12px);
        padding: 4px 0;
        box-shadow: var(--shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.05));
        margin-bottom: $spacing-sm;

        .info-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 20px;
            font-size: 13px;
            border-bottom: 1px solid $color-border;

            &:last-child {
                border-bottom: none;
            }

            .info-label {
                color: $color-text-secondary;
                font-weight: 500;
            }

            .info-value {
                color: $color-text-primary;
                font-weight: 600;
            }
        }
    }

    .about-actions {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-top: 8px;

        .text-action-btn {
            background: none;
            border: none;
            color: var(--color-primary);
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            padding: 4px 8px;
            transition: color 0.2s ease;

            &:hover {
                text-decoration: underline;
                color: var(--color-primary-dark);
            }
        }

        .divider {
            color: $color-text-disabled;
            font-size: 10px;
        }
    }
}
</style>
