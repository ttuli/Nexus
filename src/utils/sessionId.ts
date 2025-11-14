import { useUserStore } from "@/store/user";

export function getSessionId(type: 'friend' | 'group', id :bigint) {
    let sid = ''
    if (type === 'friend') {
        if (id < useUserStore().userInfo.user_id) {
            sid = useUserStore().userInfo.user_id.toString() + '_' + id.toString()
        } else {
            sid = id.toString() + '_' + useUserStore().userInfo.user_id.toString()
        }
    } else {
        sid = id.toString()
    }
    return sid
}