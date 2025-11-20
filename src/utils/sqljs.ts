import initSqlJs from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import JSONB from 'json-bigint'
import { MAX_PER_SESSION } from '@/store/chat'
import { useUserStore } from '@/store/user'

type SessionCache = { ownerId: string, data: any }
type UserCache = { userId: string, data: any, updatedAt: number, expiresAt: number }
type GroupCache = { groupId: string, data: any, updatedAt: number, expiresAt: number }
type ChatCache = { id: string, sessionId: string, seq: number, data: any }  

class SqlJsDB {
  private db: any | null = null 
  private file = 'imchat.sqlite'
  async init() {
    this.file = useUserStore().userId + "_" + this.file
    const SQL = await initSqlJs({ locateFile: () => wasmUrl })
    const buf = await window.ipcRenderer.invoke('fs:read-binary', { file: this.file })
    if (buf) {
      const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf.data ?? buf)
      this.db = new SQL.Database(bytes)
    } else {
      this.db = new SQL.Database()
      this.db.run(`
        CREATE TABLE IF NOT EXISTS chats (
          id TEXT NOT NULL,
          session_id TEXT NOT NULL,
          seq INTEGER NOT NULL,
          data TEXT NOT NULL,
          PRIMARY KEY(session_id, seq,id)
        );
        CREATE TABLE IF NOT EXISTS session_cache (
          owner_id TEXT PRIMARY KEY,
          data TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS user_cache (
          user_id TEXT PRIMARY KEY,
          data TEXT NOT NULL,
          updated_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS group_cache (
          group_id TEXT PRIMARY KEY,
          data TEXT NOT NULL,
          updated_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL
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
  saveSessions(sc: SessionCache) {
    if (!this.db) return
    const stmt = this.db.prepare(`INSERT OR REPLACE INTO session_cache(owner_id, data) VALUES(?,?)`)
    stmt.run([sc.ownerId, JSONB.stringify(sc.data)])
    stmt.free()
  }
  saveChats(chats: ChatCache[]) {
    if (!this.db) return
    console.log(chats)
    const stmt = this.db.prepare(`INSERT OR REPLACE INTO chats(id,session_id, seq, data) VALUES(?,?,?,?)`)
    chats.forEach(r => stmt.run([r.id, r.sessionId, r.seq, JSONB.stringify(r.data)])) 
    stmt.free()
  }
  getChats(sessionId: string, fromSeq?: number, endSeq?: number) {
    if (!this.db) return []
    let sql = `SELECT data FROM chats WHERE session_id = ?`
    const params: any[] = [sessionId]
    const noFrom = (fromSeq === undefined || fromSeq === null)
    const noEnd = (endSeq === undefined || endSeq === null)
    let defaultLatest = false
    if (!noFrom && !noEnd) {
      sql += ` AND seq BETWEEN ? AND ? ORDER BY seq ASC`
      params.push(fromSeq, endSeq)
    } else if (!noFrom && noEnd) {
      sql += ` AND seq >= ? ORDER BY seq ASC`
      params.push(fromSeq)
    } else if (noFrom && !noEnd) {
      sql += ` AND seq <= ? ORDER BY seq ASC`
      params.push(endSeq)
    } else {
      sql += ` ORDER BY seq DESC LIMIT ?`
      params.push(MAX_PER_SESSION)
      defaultLatest = true
    }
    const st = this.db.prepare(sql)
    st.bind(params)
    const rows: any[] = []
    while (st.step()) rows.push(st.getAsObject())
    st.free()
    let messages = rows.map(r => { try { return JSONB.parse(r.data) } catch { return r.data } })
    if (defaultLatest) messages = messages.reverse()
    return [messages]
  }

  getSession(ownerId: string) {
    if (!this.db) return []
    const st = this.db.prepare(`SELECT data FROM session_cache WHERE owner_id = ?`)
    st.bind([ownerId])
    st.step()
    const obj = st.getAsObject()
    st.free()
    return obj.data ? JSONB.parse(obj.data) : ""
  }
  saveUsers(list: UserCache[]) {
    if (!this.db || list.length === 0) return
    const stmt = this.db.prepare(`INSERT OR REPLACE INTO user_cache(user_id, data, updated_at, expires_at) VALUES(?,?,?,?)`)
    list.forEach(r => stmt.run([r.userId, JSONB.stringify(r.data), r.updatedAt, r.expiresAt]))
    stmt.free()
  }
  saveGroups(list: GroupCache[]) {
    if (!this.db || list.length === 0) return
    const stmt = this.db.prepare(`INSERT OR REPLACE INTO group_cache(group_id, data, updated_at, expires_at) VALUES(?,?,?,?)`)
    list.forEach(r => stmt.run([r.groupId, JSONB.stringify(r.data), r.updatedAt, r.expiresAt]))
    stmt.free()
  }
  cleanupExpired(now: number) {
    if (!this.db) return
    const s2 = this.db.prepare(`DELETE FROM user_cache WHERE expires_at <= ?`)
    s2.run([now])
    s2.free()
    const s3 = this.db.prepare(`DELETE FROM group_cache WHERE expires_at <= ?`)
    s3.run([now])
    s3.free()
  }
  getUsers() {
    if (!this.db) return []
    const rows: any[] = []
    const st = this.db.prepare(`SELECT data FROM user_cache WHERE expires_at > ? ORDER BY updated_at DESC`)
    st.bind([Date.now()])
    while (st.step()) rows.push(st.getAsObject())
    st.free()
    return rows.map(r => { try { return JSONB.parse(r.data) } catch { return r.data } })
  }
  getGroups() {
    if (!this.db) return []
    const rows: any[] = []
    const st = this.db.prepare(`SELECT data FROM group_cache WHERE expires_at > ? ORDER BY updated_at DESC`)
    st.bind([Date.now()])
    while (st.step()) rows.push(st.getAsObject())
    st.free()
    return rows.map(r => { try { return JSONB.parse(r.data) } catch { return r.data } })
  }
  saveAllCache(sessions: SessionCache, users: UserCache[], groups: GroupCache[], chats: ChatCache[]) {
    this.saveSessions(sessions)
    this.saveUsers(users)
    this.saveGroups(groups)
    this.saveChats(chats)
  }
}

export const sqlJsDB = new SqlJsDB()
export type { SessionCache, UserCache, GroupCache, ChatCache }