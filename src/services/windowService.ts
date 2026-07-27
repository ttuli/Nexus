/**
 * 窗口服务
 * 处理窗口相关操作
 */
import { ipcService } from './ipcService'
import { IpcChannels, IpcChannel, LogoutType } from '@shared/types'
import { WindowKey } from '@shared/config/windowKeys'
export { LogoutType }

export enum NotifySoundType {
    Message = 'msg',
    Request = 'request',
}

import { CallWindowConfig } from '@shared/types/window'

type WindowConfigMap = {
    [WindowKey.Call]: CallWindowConfig;
};

class WindowService {
    private notifyAudio: HTMLAudioElement | null = null
    /**
     * 创建新窗口
     */
    createWindow<K extends WindowKey>(
        key: K,
        config?: K extends keyof WindowConfigMap ? WindowConfigMap[K] : Record<string, any>,
        windowSize?: { width: number; height: number }
    ): void {
        // windowSize 是 CreateWindowRequest 的顶层字段，不能塞进 data ——
        // data 会被序列化成 URL query 传给渲染层，放错位置不会报错但尺寸不生效
        ipcService.send(IpcChannels.WINDOW_NEW, {
            key,
            data: config,
            ...(windowSize ? { windowSize } : {})
        })
    }

    /**
     * 最小化当前窗口
     */
    minimize(): void {
        ipcService.send(IpcChannels.WINDOW_MINIMIZE)
    }

    /**
     * 最大化/还原当前窗口
     */
    maximize(): void {
        ipcService.send(IpcChannels.WINDOW_MAXIMIZE)
    }

    close(): void {
        ipcService.send(IpcChannels.WINDOW_CLOSE)
    }

    /**
     * 隐藏当前窗口
     */
    hide(): void {
        ipcService.send(IpcChannels.WINDOW_HIDE)
    }

    /**
     * 退出应用
     */
    quit(): void {
        ipcService.send(IpcChannels.QUIT)
    }

    /**
     * 登出
     */
    logout(type: LogoutType = LogoutType.LOGOUT): void {
        ipcService.send(IpcChannels.WINDOW_PUBLISH, {
            channel: IpcChannels.LOGOUT_REMIND,
            data: { type }
        })
    }

    publish(channel: IpcChannel, data: any): void {
        ipcService.send(IpcChannels.WINDOW_PUBLISH, {
            channel,
            data
        })
    }

    /**
     * 发送登出通知到主进程
     */
    sendLogout(): void {
        ipcService.send(IpcChannels.LOGOUT)
    }

    /**
     * 监听窗口状态变化
     */
    onWindowState(callback: (state: 'maximized' | 'normal') => void): void {
        ipcService.on(IpcChannels.WINDOW_STATE, (_event, state) => callback(state))
    }

    /**
     * 检查当前窗口是否激活/获取焦点
     */
    async isFocused(): Promise<boolean> {
        const response = await ipcService.invoke(IpcChannels.WINDOW_IS_FOCUSED)
        return response.data
    }

    /**
     * 播放提示音
     */
    playNotificationSound(type: NotifySoundType = NotifySoundType.Message): void {
        if (this.notifyAudio) {
            this.notifyAudio.pause()
            this.notifyAudio.currentTime = 0
        }
        this.notifyAudio = new Audio(`/audio/notify_${type}.wav`)
        this.notifyAudio.play().catch(e => console.error('Failed to play notification sound:', e))
        ipcService.send(IpcChannels.WINDOW_FLASH_FRAME)
    }
}

export const windowService = new WindowService()
export default windowService
