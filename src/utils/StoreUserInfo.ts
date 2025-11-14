import { UserInfo } from '@/models/user'
import { useRelationStore } from '@/store/relationMap'

export function ParseUserInfo(u: any): UserInfo {
    return {
        user_id: BigInt(u?.user_id ?? u?.id ?? ''),
        user_name: String(u?.user_name ?? u?.name ?? ''),
        gender: u.gender,
        avatar: u?.avatar ?? '',
        personal_signature: u?.personal_signature ?? u?.signature ?? '',
        phone: u?.phone ?? '',
        join_type:u.join_type ?? 1
    }
}

export function StoreUserInfo(u:UserInfo) {
    const relationStore = useRelationStore()
    relationStore.setUser(u)
}