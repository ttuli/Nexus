export type PartialExcept<T, K extends keyof T> = Partial<T> & Pick<T, K>;

export interface TokenPayload {
  user_id: number
  exp: number
  iat: number
}

export interface RefreshTokenPayload {
  user_id: number
  exp: number
  iat: number
  platform: string
  device_id: string
}

export enum UpdateAction {
  Add = 1,
  Update = 2,
  Delete = 3,
}