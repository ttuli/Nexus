import { ref, onMounted, onUnmounted } from 'vue'
import { windowService } from '../services'
import { IpcChannels } from '@shared/types'

const THEME_KEY = 'app_theme'

export type Theme = 'light' | 'dark'

const getTheme = (): Theme => {
    const stored = localStorage.getItem(THEME_KEY) as Theme | null
    if (stored === 'light' || stored === 'dark') {
        return stored
    }
    if (typeof window !== 'undefined' && window.matchMedia) {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }
    return 'light'
}

export const setTheme = (t: Theme) => {
    localStorage.setItem(THEME_KEY, t)
    document.documentElement.setAttribute('data-theme', t)
    windowService.publish(IpcChannels.THEME_SYNC, t)
}

export const initTheme = () => {
    document.documentElement.setAttribute('data-theme', getTheme())
}

/**
 * 全局响应式主题 ref（单例），可在任意组件中直接 import 使用
 */
export const theme = ref<Theme>(getTheme())

/**
 * 主题 composable，应在 App.vue 中调用一次
 * 负责初始同步并通过 MutationObserver 监听 data-theme 变化，随窗口生命周期自动清理
 */
export function useTheme() {
    let observer: MutationObserver | null = null
    let mediaQuery: MediaQueryList | null = null
    let handleSystemThemeChange: ((e: MediaQueryListEvent) => void) | null = null

    onMounted(() => {
        theme.value = (document.documentElement.getAttribute('data-theme') || getTheme()) as Theme
        observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.attributeName === 'data-theme') {
                    theme.value = (document.documentElement.getAttribute('data-theme') || 'light') as Theme
                }
            }
        })
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme'],
        })

        // Listen to system theme changes if no theme is saved in localStorage
        if (typeof window !== 'undefined' && window.matchMedia) {
            mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
            handleSystemThemeChange = (e: MediaQueryListEvent) => {
                if (!localStorage.getItem(THEME_KEY)) {
                    const newTheme = e.matches ? 'dark' : 'light'
                    document.documentElement.setAttribute('data-theme', newTheme)
                    windowService.publish(IpcChannels.THEME_SYNC, newTheme)
                }
            }
            if (mediaQuery.addEventListener) {
                mediaQuery.addEventListener('change', handleSystemThemeChange)
            } else {
                // @ts-ignore
                mediaQuery.addListener(handleSystemThemeChange)
            }
        }
    })

    onUnmounted(() => {
        observer?.disconnect()
        if (mediaQuery && handleSystemThemeChange) {
            if (mediaQuery.removeEventListener) {
                mediaQuery.removeEventListener('change', handleSystemThemeChange)
            } else {
                // @ts-ignore
                mediaQuery.removeListener(handleSystemThemeChange)
            }
        }
    })

    return { theme, applyTheme: setTheme }
}
