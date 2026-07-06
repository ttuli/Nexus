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

export enum CurrentRoute {
  Chat = 1,
  Contacts = 2,
}

export enum ValidationType {
  Friend = 1,
  Group = 2,
}

// WebSocket connection state
export enum ConnectionState {
  UNRECOGNIZED = 0,
  DISCONNECTED = 1,
  CONNECTING = 2,
  CONNECTED = 3,
  RECONNECTING = 4,
}
