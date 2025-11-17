interface GroupInfo {
    id: bigint;
    name: string;
    avatar: string;
    owner_id: bigint;
    created_at: number;
    updated_at: number;
    members: GroupMember[];
}

interface GroupMember {
    group_id: bigint;
    user_id: bigint;
    role: number;
    nickname: string;
    joined_at: number;
}

export type {
    GroupInfo
}