import { useUserStore } from '@/store/user';
import { useRelationStore } from '@/store/relationMap';
import { useApplyStore } from '@/store/apply';
import { useContactStore } from '@/store/contact';
const userStore = useUserStore()
const relationStore = useRelationStore()
const applyStore = useApplyStore()
const contactStore = useContactStore()

export function createWindow(key: string) {
    window.ipcRenderer.send('window:new-window', {
        key: key,
        data: {
            token: userStore.token,
            user: { ...userStore.userInfo },
            userMap: relationStore.Fserialize(),
            groupMap: relationStore.Gserialize(),   
            applyMap: {
                friend: applyStore.Fserialize(),
            },
            contact: {
                friend: contactStore.Fserialize(),
                group: {...contactStore.Groups}
            }   
        }
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