import initSqlJs from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'

type SessionCache = { ownerId: string, sessionId: string, data: any, updatedAt: number, expiresAt: number }
type UserCache = { ownerId: string, userId: string, data: any, updatedAt: number, expiresAt: number }
type GroupCache = { ownerId: string, groupId: string, data: any, updatedAt: number, expiresAt: number }

class SqlJsDB {
  private db: any | null = null
  private file = 'imchat.sqlite'
  async init() {
    const SQL = await initSqlJs({ locateFile: () => wasmUrl })
    const buf = await window.ipcRenderer.invoke('fs:read-binary', { file: this.file })
    if (buf) {
      const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf.data ?? buf)
      this.db = new SQL.Database(bytes)
    } else {
      this.db = new SQL.Database()
      this.db.run(`
        CREATE TABLE IF NOT EXISTS session_cache (
          owner_id TEXT NOT NULL,
          session_id TEXT NOT NULL,
          data TEXT NOT NULL,
          updated_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL,
          PRIMARY KEY(owner_id, session_id)
        );
        CREATE TABLE IF NOT EXISTS user_cache (
          owner_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          data TEXT NOT NULL,
          updated_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL,
          PRIMARY KEY(owner_id, user_id)
        );
        CREATE TABLE IF NOT EXISTS group_cache (
          owner_id TEXT NOT NULL,
          group_id TEXT NOT NULL,
          data TEXT NOT NULL,
          updated_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL,
          PRIMARY KEY(owner_id, group_id)
        );
      `)
      await this.persist()
    }
  }
  async persist() {
    if (!this.db) return
    const data = this.db.export()
    await window.ipcRenderer.invoke('fs:write-binary', { file: this.file, data })
  }
  saveSessions(list: SessionCache[]) {
    if (!this.db || list.length === 0) return
    const stmt = this.db.prepare(`INSERT OR REPLACE INTO session_cache(owner_id, session_id, data, updated_at, expires_at) VALUES(?,?,?,?,?)`)
    list.forEach(r => stmt.run([r.ownerId, r.sessionId, JSON.stringify(r.data), r.updatedAt, r.expiresAt]))
    stmt.free()
  }
  /**
   * Get one session cache by owner and session id
   */
  getSession(ownerId: string, sessionId: string, now?: number) {
    if (!this.db) return null
    const n = now ?? Date.now()
    const st = this.db.prepare(`SELECT data FROM session_cache WHERE owner_id = ? AND session_id = ? AND expires_at > ? LIMIT 1`)
    const stepped = st.step([ownerId, sessionId, n])
    const obj = stepped ? st.getAsObject() : null
    st.free()
    if (!obj) return null
    try {
      return JSON.parse(obj.data)
    } catch {
      return obj.data
    }
  }
  saveUsers(list: UserCache[]) {
    if (!this.db || list.length === 0) return
    const stmt = this.db.prepare(`INSERT OR REPLACE INTO user_cache(owner_id, user_id, data, updated_at, expires_at) VALUES(?,?,?,?,?)`)
    list.forEach(r => stmt.run([r.ownerId, r.userId, JSON.stringify(r.data), r.updatedAt, r.expiresAt]))
    stmt.free()
  }
  saveGroups(list: GroupCache[]) {
    if (!this.db || list.length === 0) return
    const stmt = this.db.prepare(`INSERT OR REPLACE INTO group_cache(owner_id, group_id, data, updated_at, expires_at) VALUES(?,?,?,?,?)`)
    list.forEach(r => stmt.run([r.ownerId, r.groupId, JSON.stringify(r.data), r.updatedAt, r.expiresAt]))
    stmt.free()
  }
  cleanupExpired(now: number) {
    if (!this.db) return
    const s1 = this.db.prepare(`DELETE FROM session_cache WHERE expires_at <= ?`)
    s1.run([now])
    s1.free()
    const s2 = this.db.prepare(`DELETE FROM user_cache WHERE expires_at <= ?`)
    s2.run([now])
    s2.free()
    const s3 = this.db.prepare(`DELETE FROM group_cache WHERE expires_at <= ?`)
    s3.run([now])
    s3.free()
  }
  getSessions(ownerId?: string, now?: number) {
    if (!this.db) return []
    const n = now ?? Date.now()
    const rows: any[] = []
    if (ownerId) {
      const st = this.db.prepare(`SELECT data FROM session_cache WHERE owner_id = ? AND expires_at > ? ORDER BY updated_at DESC`)
      while (st.step([ownerId, n])) rows.push(st.getAsObject())
      st.free()
    } else {
      const st = this.db.prepare(`SELECT data FROM session_cache WHERE expires_at > ? ORDER BY updated_at DESC`)
      while (st.step([n])) rows.push(st.getAsObject())
      st.free()
    }
    return rows.map(r => { try { return JSON.parse(r.data) } catch { return r.data } })
  }
  getSessionsWithMeta(ownerId?: string, now?: number) {
    if (!this.db) return []
    const n = now ?? Date.now()
    const rows: any[] = []
    if (ownerId) {
      const st = this.db.prepare(`SELECT session_id, data FROM session_cache WHERE owner_id = ? AND expires_at > ? ORDER BY updated_at DESC`)
      while (st.step([ownerId, n])) rows.push(st.getAsObject())
      st.free()
    } else {
      const st = this.db.prepare(`SELECT session_id, data FROM session_cache WHERE expires_at > ? ORDER BY updated_at DESC`)
      while (st.step([n])) rows.push(st.getAsObject())
      st.free()
    }
    return rows.map(r => {
      let data
      try { data = JSON.parse(r.data) } catch { data = r.data }
      return { sessionId: String(r.session_id || ''), data }
    })
  }
  getUsers(ownerId?: string, now?: number) {
    if (!this.db) return []
    const n = now ?? Date.now()
    const rows: any[] = []
    if (ownerId) {
      const st = this.db.prepare(`SELECT data FROM user_cache WHERE owner_id = ? AND expires_at > ? ORDER BY updated_at DESC`)
      while (st.step([ownerId, n])) rows.push(st.getAsObject())
      st.free()
    } else {
      const st = this.db.prepare(`SELECT data FROM user_cache WHERE expires_at > ? ORDER BY updated_at DESC`)
      while (st.step([n])) rows.push(st.getAsObject())
      st.free()
    }
    return rows.map(r => { try { return JSON.parse(r.data) } catch { return r.data } })
  }
  getGroups(ownerId?: string, now?: number) {
    if (!this.db) return []
    const n = now ?? Date.now()
    const rows: any[] = []
    if (ownerId) {
      const st = this.db.prepare(`SELECT data FROM group_cache WHERE owner_id = ? AND expires_at > ? ORDER BY updated_at DESC`)
      while (st.step([ownerId, n])) rows.push(st.getAsObject())
      st.free()
    } else {
      const st = this.db.prepare(`SELECT data FROM group_cache WHERE expires_at > ? ORDER BY updated_at DESC`)
      while (st.step([n])) rows.push(st.getAsObject())
      st.free()
    }
    return rows.map(r => { try { return JSON.parse(r.data) } catch { return r.data } })
  }
  getAllCache(ownerId?: string, now?: number) {
    const sessions = this.getSessions(ownerId, now)
    const users = this.getUsers(ownerId, now)
    const groups = this.getGroups(ownerId, now)
    return { sessions, users, groups }
  }
}

export const sqlJsDB = new SqlJsDB()
export type { SessionCache, UserCache, GroupCache }