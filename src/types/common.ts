export interface ApiResponse<T> {
  data: T
  code: number
  message: string
}

export interface TokenPayload {
  user_id: string
  exp: number
  iat: number
}