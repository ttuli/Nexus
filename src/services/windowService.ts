/**
 * 窗口服务
 * 处理窗口相关操作
 */
import { ipcService } from './ipcService'
import { IpcChannels, LogoutType } from '@/types'

export { LogoutType }

export enum NotifySoundType {
    Message = 'msg',
    Request = 'request',   
}

class WindowService {
    /**
     * 创建新窗口
     */
    createWindow(config: { key: string;[key: string]: any }): void {
        ipcService.send(IpcChannels.WINDOW_NEW, config)
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
        const audio = new Audio(`/audio/notify_${type}.wav`);
        audio.play().catch(e => console.error('Failed to play notification sound:', e));
        ipcService.send(IpcChannels.WINDOW_FLASH_FRAME);
    }
}

export const windowService = new WindowService()
export default windowService
