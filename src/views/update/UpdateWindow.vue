<template>
    <TitleBar class="titlebar" />
    <div class="update-window">
        <!-- 应用信息 -->
        <div class="brand">
            <img :src="icon" class="brand-icon" alt="" />
            <div class="brand-text">
                <h2 class="headline">{{ headline }}</h2>
                <p class="subline">
                    {{ APP_CONSTANTS.ApplicationName }}<template v-if="state?.currentVersion"> · 当前版本 v{{ state.currentVersion }}</template>
                </p>
            </div>
        </div>

        <!-- 强制更新说明 -->
        <div v-if="state?.mode === 'forced'" class="forced-banner">
            {{ state.serverMessage || '当前版本已停止支持，更新后才能继续使用' }}
        </div>

        <!-- 新版本信息 -->
        <ReleaseNotes
            v-if="state?.targetVersion"
            class="release"
            :version="state.targetVersion"
            :notes="state.releaseNotes"
            max-height="100%"
        />
        <div v-else class="release placeholder"></div>

        <!-- 当前阶段 -->
        <div class="status">
            <template v-if="phase === 'downloading'">
                <div class="progress-text">
                    <span>{{ progressDetail }}</span>
                    <span class="percent">{{ percent }}%</span>
                </div>
                <div class="progress-bar-bg">
                    <div class="progress-bar-fill" :style="{ width: percent + '%' }"></div>
                </div>
            </template>
            <div v-else-if="phase === 'checking' || phase === 'installing'" class="status-line">
                <span class="spinner"></span>
                <span>{{ phase === 'checking' ? '正在检查更新…' : '即将退出并安装新版本，完成后会自动重新打开' }}</span>
            </div>
            <div v-else-if="phase === 'downloaded'" class="status-line success">
                下载完成，重启后即可完成安装
            </div>
            <div v-else-if="phase === 'error' || phase === 'install-failed'" class="status-line error">
                {{ state?.error }}
            </div>
        </div>

        <!-- 操作 -->
        <div v-if="actions.length" class="actions">
            <CusButton
                v-for="action in actions"
                :key="action.label"
                class="action"
                :type="action.primary ? 'primary' : 'normal'"
                :show-icon="false"
                @click="action.run"
            >
                {{ action.label }}
            </CusButton>
        </div>
    </div>
</template>

<script setup lang="ts">
/**
 * 更新窗口：展示下载进度，承接失败后的兜底操作。
 * 检查、下载、安装全在主进程 updateManager，这里只展示状态、转发用户操作。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import TitleBar from '@/src/components/TitleBar.vue'
import CusButton from '@/src/components/CusButton.vue'
import ReleaseNotes from '@/src/components/ReleaseNotes.vue'
import { updateService } from '@/src/services'
import { signalWindowReady } from '@/src/utils/window'
import { publicUrl } from '@/src/utils/resourceUrl'
import { APP_CONSTANTS, APP_ICON } from '@shared/config/constants'
import type { UpdatePhase, UpdateState } from '@shared/types'

interface Action {
    label: string
    primary?: boolean
    run: () => void
}

const icon = publicUrl(APP_ICON.normal)
const state = ref<UpdateState | null>(null)

// 状态还没拉到时按「检查中」展示
const phase = computed<UpdatePhase>(() => state.value?.phase ?? 'checking')
const isForced = computed(() => state.value?.mode === 'forced')

const HEADLINES: Record<UpdatePhase, string> = {
    'checking': '正在检查更新',
    'downloading': '正在下载新版本',
    'downloaded': '新版本已就绪',
    'installing': '即将完成更新',
    'error': '更新未完成',
    'install-failed': '需要手动安装',
}
const headline = computed(() => HEADLINES[phase.value])

const percent = computed(() => Math.min(100, Math.floor(state.value?.progress?.percent ?? 0)))

const formatSize = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    const val = parseFloat((bytes / Math.pow(k, i)).toFixed(1))
    return val + ' ' + sizes[i]
}

const progressDetail = computed(() => {
    const p = state.value?.progress
    // 下载刚开始、还没拿到总大小
    if (!p || !p.total) return '正在连接更新服务器…'
    return `${formatSize(p.transferred)} / ${formatSize(p.total)} · ${formatSize(p.bytesPerSecond)}/s`
})

const openDownloadPage = () => updateService.openDownloadPage()
const close = () => updateService.close()

/**
 * 各阶段可用的操作，主操作排第一（按钮区是 row-reverse，第一个落在最右）。
 * 强制更新下「退出」即退出应用，可选更新下「关闭」只关本窗口。
 */
const actions = computed<Action[]>(() => {
    const s = state.value
    if (!s) return []
    const exitAction: Action = { label: isForced.value ? '退出' : '关闭', run: close }
    const downloadPage: Action[] = s.hasDownloadPage ? [{ label: '前往官网下载', run: openDownloadPage }] : []

    switch (s.phase) {
        case 'checking':
        case 'downloading':
            // 强制更新没有「取消」：取消等于退出，标题栏的关闭已经够用
            return isForced.value ? [] : [{ label: '取消', run: close }]
        case 'downloaded':
            return [
                { label: '立即重启安装', primary: true, run: () => updateService.install() },
                // 关窗后由 autoInstallOnAppQuit 在下次退出应用时静默安装
                { label: '稍后安装', run: close },
            ]
        case 'installing':
            return []
        case 'error':
            return [
                { label: '重试', primary: true, run: () => updateService.retry() },
                ...downloadPage,
                exitAction,
            ]
        case 'install-failed':
            return [
                ...(s.hasInstaller
                    ? [{ label: '打开安装包位置', primary: true, run: () => updateService.showInstaller() }]
                    : []),
                { label: '重新安装', run: () => updateService.install() },
                ...downloadPage,
                exitAction,
            ]
    }
    return []
})

onMounted(async () => {
    // 先挂监听再补拉：主进程可能在窗口加载期间就推过状态
    updateService.onState((s) => {
        state.value = s
    })
    const current = await updateService.getState()
    if (current) state.value = current
    signalWindowReady()
})

onUnmounted(() => {
    updateService.offState()
})
</script>

<style scoped lang="scss">
@use "@/src/style/_constant.scss" as *;

.titlebar {
    position: fixed;
    z-index: 100;
}

.update-window {
    display: flex;
    flex-direction: column;
    gap: 16px;
    height: 100vh;
    padding: 44px 28px 24px;
    box-sizing: border-box;
    background: var(--surface-default, #ffffff);
    color: $color-text-primary;

    .brand {
        display: flex;
        align-items: center;
        gap: 14px;

        .brand-icon {
            width: 48px;
            height: 48px;
            flex-shrink: 0;
        }

        .headline {
            margin: 0 0 4px;
            font-size: 20px;
            font-weight: 700;
            color: $color-text-title;
        }

        .subline {
            margin: 0;
            font-size: 13px;
            color: $color-text-secondary;
        }
    }

    .forced-banner {
        padding: 10px 12px;
        border-radius: var(--radius-md, 8px);
        border-left: 3px solid $color-warning;
        background: rgba(250, 173, 20, 0.1);
        font-size: 13px;
        line-height: 1.5;
    }

    // 说明区吃掉剩余高度，内容多了在内部滚动
    .release {
        flex: 1;
        min-height: 0;

        :deep(.notes) {
            flex: 1;
            min-height: 0;
        }

        &.placeholder {
            min-height: 0;
        }
    }

    .status {
        min-height: 36px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 8px;
        font-size: 13px;

        .progress-text {
            display: flex;
            justify-content: space-between;
            color: $color-text-secondary;

            .percent {
                font-weight: 600;
                color: $color-primary;
            }
        }

        .progress-bar-bg {
            height: 6px;
            background-color: var(--border-divider, #e2e8f0);
            border-radius: 999px;
            overflow: hidden;

            [data-theme='dark'] & {
                background-color: rgba(255, 255, 255, 0.12);
            }

            .progress-bar-fill {
                height: 100%;
                background: linear-gradient(90deg, #3b82f6, #60a5fa);
                border-radius: 999px;
                transition: width 0.25s ease-out;
            }
        }

        .status-line {
            display: flex;
            align-items: center;
            gap: 8px;
            line-height: 1.5;
            color: $color-text-secondary;

            &.success {
                color: $color-success;
            }

            &.error {
                color: $color-error;
                user-select: text;
                -webkit-app-region: no-drag;
            }
        }

        .spinner {
            width: 14px;
            height: 14px;
            flex-shrink: 0;
            border: 2px solid $color-primary;
            border-top-color: transparent;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
    }

    // 主按钮放最右（与弹框一致），超过两个自动换行
    .actions {
        display: flex;
        flex-wrap: wrap;
        flex-direction: row-reverse;
        gap: 10px;

        .action {
            flex: 1 1 40%;
            width: auto;
        }
    }
}

@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}
</style>
