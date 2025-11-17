interface NewApplyRequestF {
    target: bigint;
    sender: bigint;
    authContent: string;
}

interface HandleApplyRequestF {
    applyId: string;
    result: ApplyStatus;
    msg:string;
}

interface HandleApplyRequestG {
    applyId: string;
    result: ApplyStatus;
    msg:string;
}

interface SessionMsgReq {
    sessionId: string;
    fromSeq:number;
    endSeq:number
}

interface GetOfflineReq {
    limit: number;
}

interface AckOfflineMsgReq {
    msgIds: string[];
}

enum ApplyStatus {
    Pending = 1,
    Accepted = 2,
    Rejected = 3,
    Expired = 4
}

interface FriendInfo {
  user_id:bigint,
  remark: string
}

interface FriendApplyInfo {
    apply_id: string;
    user_id:bigint,
    sender_id:bigint,
    message:string,
    time:bigint,
    status:ApplyStatus,
}

interface GroupApplyInfo {
    request_id: string;
    sender_id:bigint,
    group_id:bigint;
    message:string;
    status:ApplyStatus,
    request_time:number,
}

interface CreateGroupReq {
    name: string
}

interface GetGroupReq {
    name: string
    ownerId: bigint,
    id: bigint
}

interface JoinGroupReq {
    groupId: bigint
    sender: bigint
    receiver: bigint
    msg: string
}

export type {
    HandleApplyRequestF,
    HandleApplyRequestG,
    NewApplyRequestF,
    FriendApplyInfo,
    CreateGroupReq,
    GetGroupReq,
    FriendInfo,
    JoinGroupReq,
    GroupApplyInfo,
    SessionMsgReq,
    GetOfflineReq,
    AckOfflineMsgReq
}
export {
    ApplyStatus
}