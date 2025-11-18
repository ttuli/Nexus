import { ipcMain } from 'electron'
import keytar from 'keytar'

const SERVICE = 'IMChat'
const ACCOUNT = 'refresh_token'

// 注册 IPC handlers
export function registerKeytarHandlers() {
  // 保存 refresh token
  ipcMain.handle('keytar:saveRefreshToken', async (_event, token: string) => {
    try {
      await keytar.setPassword(SERVICE, ACCOUNT, token)
      return { success: true }
    } catch (error) {
      console.error('Failed to save refresh token:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // 获取 refresh token
  ipcMain.handle('keytar:getRefreshToken', async () => {
    try {
      const token = await keytar.getPassword(SERVICE, ACCOUNT)
      return { success: true, token }
    } catch (error) {
      console.error('Failed to get refresh token:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // 删除 refresh token
  ipcMain.handle('keytar:deleteRefreshToken', async () => {
    try {
      const deleted = await keytar.deletePassword(SERVICE, ACCOUNT)
      return { success: true, deleted }
    } catch (error) {
      console.error('Failed to delete refresh token:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('keytar:setKey', async (_event, payload: { key: string, value: string }) => {
    try {
      const { key, value } = payload || { key: '', value: '' }
      if (!key) return { success: false, error: 'Invalid key' }
      await keytar.setPassword(SERVICE, key, value ?? '')
      return { success: true }
    } catch (error) {
      console.error('Failed to set key:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('keytar:getKey', async (_event, key: string) => {
    try {
      if (!key) return { success: false, error: 'Invalid key' }
      const value = await keytar.getPassword(SERVICE, key)
      return { success: true, value }
    } catch (error) {
      console.error('Failed to get key:', error)
      return { success: false, error: (error as Error).message }
    }
  })
}