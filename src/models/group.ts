interface GroupInfo {
    id: bigint;
    name: string;
    avatar: string;
    owner_id: bigint;
    created_at: number;
    updated_at: number;
    member_ids: bigint[];
}

export type {
    GroupInfo
}