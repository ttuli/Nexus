import { ipcRenderer, contextBridge, webUtils } from 'electron'
import { IpcChannels } from '@shared/types/ipc'

// 获取所有允许的 IPC 通道作为白名单
const validChannels = Object.values(IpcChannels)

// 验证通道是否在白名单中
function validateChannel(channel: string) {
  if (channel.startsWith('file-download-progress-')) {
    return
  }
  if (!validChannels.includes(channel as any)) {
    console.error(`[IPC Security] Access denied for channel: ${channel}`)
    throw new Error(`[IPC Security] Blocked unauthorized IPC channel: ${channel}`)
  }
}

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    validateChannel(channel)
    return ipcRenderer.on(channel, (event, ...listenerArgs) => listener(event, ...listenerArgs))
  },
  once(...args: Parameters<typeof ipcRenderer.once>) {
    const [channel, listener] = args
    validateChannel(channel)
    return ipcRenderer.once(channel, (event, ...listenerArgs) => listener(event, ...listenerArgs))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel] = args
    validateChannel(channel)
    return ipcRenderer.off(...args)
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel] = args
    validateChannel(channel)
    return ipcRenderer.send(...args)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel] = args
    validateChannel(channel)
    return ipcRenderer.invoke(...args)
  },
  removeAllListeners(...args: Parameters<typeof ipcRenderer.removeAllListeners>) {
    const [channel] = args
    if (channel) {
      validateChannel(channel as string)
    }
    return ipcRenderer.removeAllListeners(...args)
  },
})

// Expose webUtils for getting local file paths from File objects
contextBridge.exposeInMainWorld('webUtils', {
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
})

// Expose process object for platform detection (移除了 process.env)
contextBridge.exposeInMainWorld('process', {
  platform: process.platform,
  versions: process.versions,
})

