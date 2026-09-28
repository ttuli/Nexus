/**
 * 应用更新服务（纯 I/O）
 *
 * 检查、下载、安装全部在主进程 updateManager 里完成，这里只做 IPC 收发：
 * - 登录窗 / 主窗口：拉取与监听「可选更新提示」，回传用户的选择
 * - 更新窗口：拉取与监听更新状态，发送重试 / 安装 / 关闭等操作
 */
import { ipcService } from './ipcService'
import { IpcChannels } from '@shared/types'
import type { UpdatePromptAction, UpdatePromptInfo, UpdateState } from '@shared/types'

class UpdateService {
    // ==================== 可选更新提示 ====================

    /** 拉取待提示的可选更新（窗口挂载晚于检查完成时，主进程的推送已经错过） */
    async getPrompt(): Promise<UpdatePromptInfo | null> {
        const res = await ipcService.invoke<UpdatePromptInfo | null>(IpcChannels.UPDATE_GET_PROMPT)
        return res.success ? res.data ?? null : null
    }

    onPrompt(callback: (info: UpdatePromptInfo) => void): void {
        ipcService.on(IpcChannels.UPDATE_PROMPT, (_event, info: UpdatePromptInfo) => callback(info))
    }

    offPrompt(): void {
        ipcService.off(IpcChannels.UPDATE_PROMPT)
    }

    respondPrompt(action: UpdatePromptAction): void {
        ipcService.send(IpcChannels.UPDATE_PROMPT_RESPOND, action)
    }

    // ==================== 更新窗口 ====================

    async getState(): Promise<UpdateState | null> {
        const res = await ipcService.invoke<UpdateState | null>(IpcChannels.UPDATE_GET_STATE)
        return res.success ? res.data ?? null : null
    }

    onState(callback: (state: UpdateState) => void): void {
        ipcService.on(IpcChannels.UPDATE_STATE, (_event, state: UpdateState) => callback(state))
    }

    offState(): void {
        ipcService.off(IpcChannels.UPDATE_STATE)
    }

    /** 重新检查并下载 */
    retry(): void {
        ipcService.send(IpcChannels.UPDATE_RETRY)
    }

    /** 退出并安装已下载的新版本 */
    install(): void {
        ipcService.send(IpcChannels.UPDATE_INSTALL)
    }

    /** 关闭更新窗口：可选更新即放弃本次下载，强制更新即退出应用 */
    close(): void {
        ipcService.send(IpcChannels.UPDATE_CLOSE)
    }

    openDownloadPage(): void {
        ipcService.send(IpcChannels.UPDATE_OPEN_DOWNLOAD_PAGE)
    }

    showInstaller(): void {
        ipcService.send(IpcChannels.UPDATE_SHOW_INSTALLER)
    }
}

export const updateService = new UpdateService()
export default updateService
