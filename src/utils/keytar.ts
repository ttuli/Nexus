// keytar.api.ts (渲染进程)

/**
 * 保存 refresh token 到系统密钥链
 * @param token - 要保存的 refresh token
 * @returns 是否保存成功
 */
export async function saveRefreshToken(token: string): Promise<boolean> {
  try {
    const result = await window.ipcRenderer.invoke('keytar:saveRefreshToken', token)
    if (!result.success) {
      console.error('Failed to save refresh token:', result.error)
      return false
    }
    return true
  } catch (error) {
    console.error('Error saving refresh token:', error)
    return false
  }
}

/**
 * 从系统密钥链获取 refresh token
 * @returns refresh token 或 null
 */
export async function getRefreshToken(): Promise<string | null> {
  try {
    const result = await window.ipcRenderer.invoke('keytar:getRefreshToken')
    if (!result.success) {
      console.error('Failed to get refresh token:', result.error)
      return null
    }
    return result.token || null
  } catch (error) {
    console.error('Error getting refresh token:', error)
    return null
  }
}

/**
 * 从系统密钥链删除 refresh token
 * @returns 是否删除成功
 */
export async function deleteRefreshToken(): Promise<boolean> {
  try {
    const result = await window.ipcRenderer.invoke('keytar:deleteRefreshToken')
    if (!result.success) {
      console.error('Failed to delete refresh token:', result.error)
      return false
    }
    return result.deleted || false
  } catch (error) {
    console.error('Error deleting refresh token:', error)
    return false
  }
}

export const KEY_AUTO_LOGIN = 'auto_login'

export async function setKey(key: string, value: string): Promise<boolean> {
  try {
    const result = await window.ipcRenderer.invoke('keytar:setKey', { key, value })
    if (!result.success) {
      console.error('Failed to set key:', result.error)
      return false
    }
    return true
  } catch (error) {
    console.error('Error setting key:', error)
    return false
  }
}

export async function getKey(key: string): Promise<string | null> {
  try {
    const result = await window.ipcRenderer.invoke('keytar:getKey', key)
    if (!result.success) {
      console.error('Failed to get key:', result.error)
      return null
    }
    return result.value ?? null
  } catch (error) {
    console.error('Error getting key:', error)
    return null
  }
}