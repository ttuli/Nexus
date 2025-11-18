import { app, ipcMain, safeStorage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

const REFRESH_FILE = 'refresh_token.bin'

// 注册 IPC handlers
function writeEncrypted(file: string, plain: string) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Encryption not available')
  const enc = safeStorage.encryptString(plain)
  const dir = app.getPath('userData')
  const fp = path.join(dir, file)
  fs.writeFileSync(fp, enc)
}

function readDecrypted(file: string): string | null {
  if (!safeStorage.isEncryptionAvailable()) return null
  const dir = app.getPath('userData')
  const fp = path.join(dir, file)
  if (!fs.existsSync(fp)) return null
  const buf = fs.readFileSync(fp)
  try {
    return safeStorage.decryptString(buf)
  } catch {
    return null
  }
}

function delFile(file: string): boolean {
  const dir = app.getPath('userData')
  const fp = path.join(dir, file)
  if (!fs.existsSync(fp)) return true
  fs.unlinkSync(fp)
  return true
}

function keyToFile(key: string) {
  const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_')
  return `secure_${safeKey}.bin`
}

export function registerKeytarHandlers() {
  ipcMain.handle('safeStorage:saveRefreshToken', async (_event, token: string) => {
    try {
      writeEncrypted(REFRESH_FILE, token)
      return { success: true }
    } catch (error) {
      console.error('Failed to save refresh token:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('safeStorage:getRefreshToken', async () => {
    try {
      const token = readDecrypted(REFRESH_FILE)
      return { success: true, token }
    } catch (error) {
      console.error('Failed to get refresh token:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('safeStorage:deleteRefreshToken', async () => {
    try {
      const deleted = delFile(REFRESH_FILE)
      return { success: true, deleted }
    } catch (error) {
      console.error('Failed to delete refresh token:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('safeStorage:setKey', async (_event, payload: { key: string, value: string }) => {
    try {
      const { key, value } = payload || { key: '', value: '' }
      if (!key) return { success: false, error: 'Invalid key' }
      writeEncrypted(keyToFile(key), value ?? '')
      return { success: true }
    } catch (error) {
      console.error('Failed to set key:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('safeStorage:getKey', async (_event, key: string) => {
    try {
      if (!key) return { success: false, error: 'Invalid key' }
      const value = readDecrypted(keyToFile(key))
      return { success: true, value }
    } catch (error) {
      console.error('Failed to get key:', error)
      return { success: false, error: (error as Error).message }
    }
  })
}