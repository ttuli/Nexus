
interface WsConfig {
    url: string
    reconnectInterval?: number
    heartbeatInterval?: number
}
export const wsConfig = {
  url: import.meta.env.VITE_WS_URL,
  reconnectInterval: 3000,
  heartbeatInterval: 10000,
}

export type {
    WsConfig
}