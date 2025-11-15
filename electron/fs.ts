import fs from 'node:fs'
import { app, ipcMain } from 'electron'
import path from 'node:path'

ipcMain.handle('fs:read-binary', (e, payload) => {
  const file = String(payload?.file || '')
  if (!file) return null
  const dir = app.getPath('userData')
  const fp = path.join(dir, file)
  if (!fs.existsSync(fp)) return null
  return fs.readFileSync(fp)
})


ipcMain.handle('fs:write-binary', (e, payload) => {
  const file = String(payload?.file || '')
  const data = payload?.data
  if (!file || !data) return { ok: false }
  const dir = app.getPath('userData')
  const fp = path.join(dir, file)
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data)
  fs.writeFileSync(fp, buf)
  return { ok: true }
})