interface UserInfo {
  user_id: bigint;                // 用户ID
  user_name: string;              // 用户名
  avatar?: string;                // 头像URL，可为空
  gender: number;                 // 性别：0未知 1男 2女
  phone: string;                  // 手机号
  join_type: number;              // 加入类型：0直接加入，1同意后加好友
  personal_signature?: string;    // 个性签名，可为空
}

interface LoginRequest {
  phone: string;
  password: string;
}

interface LoginResponse {
  token: string;
  refreshToken: string;
}

interface RegisterRequest {
  phone: string;
  username: string;
  password: string;
}

interface UpdateUserInfoRequest {
  id?: number;
  user_name?: string;
  gender?: number;
  join_type?: number;
  personal_signature?: string;
}

export type {
    UserInfo,
    LoginRequest,
    LoginResponse,
    RegisterRequest,
    UpdateUserInfoRequest
}