import { useUserStore } from '@/store/user';
const userStore = useUserStore()

export function createWindow(key: string) {
    window.ipcRenderer.send('window:new-window', {
        key: key,
    })
}

export function updateAllInfo() {
    window.ipcRenderer.send('window:publish', {
        channel:'update-userinfo',
        data: {
            user: { ...userStore.userInfo },
            token: userStore.token
        }
    })
}