import { IpcChannels } from '@/types'

export enum LogoutType {
    LOGOUT = 'logout',
    KICKED = 'kicked',
}

export function createWindow(key: string, data?: any) {
    window.ipcRenderer.send(IpcChannels.WINDOW_NEW, {
        key: key,
        data: data
    })
}

export function logout(type: LogoutType) {
    window.ipcRenderer.send(IpcChannels.WINDOW_PUBLISH, {
        channel: IpcChannels.LOGOUT_REMIND,
        data: {
            type: type
        }
    })
}
