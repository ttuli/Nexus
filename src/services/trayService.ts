/**
 * 托盘菜单服务
 * 托盘右键菜单弹层与主进程之间的 IPC 收发，不含任何状态
 */
import { ipcService } from './ipcService'
import { IpcChannels } from '@shared/types'
import { TrayMenuAction, TrayMenuSize } from '@shared/types/window'

class TrayService {
    /**
     * 上报弹层测量尺寸，主进程据此把窗口摆到托盘图标旁并按内容裁到刚好大小
     */
    reportMenuSize(size: TrayMenuSize): void {
        ipcService.send(IpcChannels.TRAY_MENU_READY, size)
    }

    /**
     * 执行菜单项（打开主界面 / 设置 / 退出），动作实现在主进程 TrayManager
     */
    runAction(action: TrayMenuAction): void {
        ipcService.send(IpcChannels.TRAY_MENU_ACTION, action)
    }

    /**
     * 收起菜单（点击空白处、Esc）；失焦收起由主进程窗口钩子处理
     */
    closeMenu(): void {
        ipcService.send(IpcChannels.TRAY_MENU_CLOSE)
    }

    /**
     * 监听"弹层已显示"，用于重播入场动画
     */
    onMenuShow(callback: () => void): void {
        ipcService.on(IpcChannels.TRAY_MENU_SHOW, () => callback())
    }

    offMenuShow(): void {
        ipcService.off(IpcChannels.TRAY_MENU_SHOW)
    }
}

export const trayService = new TrayService()
export default trayService
