import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('Hermes schema initialization', () => {
  let db: any = null

  beforeEach(async () => {
    vi.resetModules()
    const { DatabaseSync } = await import('node:sqlite')
    db = new DatabaseSync(':memory:')
    vi.doMock('../../packages/server/src/db/index', () => ({
      getDb: () => db,
      getStoragePath: () => ':memory:',
    }))
  })

  afterEach(() => {
    db?.close()
    db = null
    vi.doUnmock('../../packages/server/src/db/index')
    vi.resetModules()
  })

  it('initializes all tables with correct schemas', async () => {
    const { initAllHermesTables, USAGE_TABLE, SESSIONS_TABLE, MESSAGES_TABLE, USERS_TABLE, USER_PROFILES_TABLE } =
      await import('../../packages/server/src/db/hermes/schemas')

    expect(() => initAllHermesTables()).not.toThrow()

    // Verify core tables exist
    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as Array<{ name: string }>
    expect(tables.map(t => t.name)).toContain(USAGE_TABLE)
    expect(tables.map(t => t.name)).toContain(SESSIONS_TABLE)
    expect(tables.map(t => t.name)).toContain(MESSAGES_TABLE)
    expect(tables.map(t => t.name)).toContain(USERS_TABLE)
    expect(tables.map(t => t.name)).toContain(USER_PROFILES_TABLE)

    // Verify USAGE_TABLE structure
    const usageCols = db.prepare(`PRAGMA table_info("${USAGE_TABLE}")`).all() as Array<{ name: string }>
    expect(usageCols.some(c => c.name === 'id')).toBe(true)
    expect(usageCols.some(c => c.name === 'session_id')).toBe(true)
    expect(usageCols.some(c => c.name === 'input_tokens')).toBe(true)
    expect(usageCols.some(c => c.name === 'output_tokens')).toBe(true)

    const userCols = db.prepare(`PRAGMA table_info("${USERS_TABLE}")`).all() as Array<{ name: string }>
    expect(userCols.some(c => c.name === 'id')).toBe(true)
    expect(userCols.some(c => c.name === 'username')).toBe(true)
    expect(userCols.some(c => c.name === 'password_hash')).toBe(true)
    expect(userCols.some(c => c.name === 'role')).toBe(true)

    const profileCols = db.prepare(`PRAGMA table_info("${USER_PROFILES_TABLE}")`).all() as Array<{ name: string }>
    expect(profileCols.some(c => c.name === 'user_id')).toBe(true)
    expect(profileCols.some(c => c.name === 'profile_name')).toBe(true)
    expect(profileCols.some(c => c.name === 'is_default')).toBe(true)
  })

  it('preserves existing data when adding safe schema columns', async () => {
    const { initAllHermesTables, USAGE_TABLE, USAGE_SCHEMA } =
      await import('../../packages/server/src/db/hermes/schemas')

    // Create table with minimal schema
    db.exec(`CREATE TABLE "${USAGE_TABLE}" (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, created_at INTEGER NOT NULL)`)

    // Insert test data
    db.prepare(`INSERT INTO "${USAGE_TABLE}" (session_id, created_at) VALUES (?, ?)`).run('test-session', Date.now())

    // Run initialization (should add safe missing columns)
    expect(() => initAllHermesTables()).not.toThrow()

    // Verify data is preserved
    const row = db.prepare(`SELECT * FROM "${USAGE_TABLE}" WHERE session_id = ?`).get('test-session')
    expect(row).toBeTruthy()
    expect(row.session_id).toBe('test-session')

    // Verify safe new columns were added
    const cols = db.prepare(`PRAGMA table_info("${USAGE_TABLE}")`).all() as Array<{ name: string }>
    expect(cols.some(c => c.name === 'input_tokens')).toBe(true)
    expect(cols.some(c => c.name === 'output_tokens')).toBe(true)
  })

})
