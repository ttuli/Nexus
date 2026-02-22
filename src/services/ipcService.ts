/**
 * IPC 通信服务
 * 封装渲染进程与主进程的 IPC 通信
 */

// IPC 响应类型
export interface IpcResponse<T = any> {
    success: boolean
    data?: T
    error?: string
}

// IPC 通道事件回调
type IpcCallback = (event: any, ...args: any[]) => void

class IpcService {
    private listeners = new Map<string, IpcCallback[]>()

    /**
     * 调用主进程方法并等待响应
     */
    async invoke<T = any>(channel: string, ...args: any[]): Promise<IpcResponse<T>> {
        try {
            const result = await window.ipcRenderer.invoke(channel, ...args)
            // 主进程返回的格式可能是 { success, data, error } 或 { success, ...rest }
            if (typeof result === 'object' && 'success' in result) {
                return result as IpcResponse<T>
            }
            return { success: true, data: result }
        } catch (error) {
            console.error(`[IpcService] invoke ${channel} failed:`, error)
            return { success: false, error: String(error) }
        }
    }

    /**
     * 发送消息到主进程（不等待响应）
     */
    send(channel: string, ...args: any[]): void {
        window.ipcRenderer.send(channel, ...args)
    }

    /**
     * 监听主进程消息
     */
    on(channel: string, callback: IpcCallback): void {
        window.ipcRenderer.on(channel, callback)

        // 记录监听器以便清理
        if (!this.listeners.has(channel)) {
            this.listeners.set(channel, [])
        }
        this.listeners.get(channel)!.push(callback)
    }

    /**
     * 监听一次主进程消息
     */
    once(channel: string, callback: IpcCallback): void {
        window.ipcRenderer.once(channel, callback)
    }

    /**
     * 移除特定通道的所有监听器
     */
    off(channel: string): void {
        window.ipcRenderer.removeAllListeners(channel)
        this.listeners.delete(channel)
    }

    /**
     * 移除所有监听器
     */
    removeAllListeners(): void {
        for (const channel of this.listeners.keys()) {
            window.ipcRenderer.removeAllListeners(channel)
        }
        this.listeners.clear()
    }
}

export const ipcService = new IpcService()
export default ipcService
