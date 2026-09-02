import { beforeAll, beforeEach, describe, expect, it, vi, afterEach } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { unlinkSync, existsSync, mkdirSync, copyFileSync, writeFileSync, readFileSync } from 'fs'
import { resolve } from 'path'

// Test database path
const TEST_DB_DIR = resolve(process.cwd(), 'packages/server/data/test')
const TEST_DB_PATH = resolve(TEST_DB_DIR, 'test-hermes.db')

// Global test database instance
let testDbInstance: DatabaseSync | null = null

// Mock getDb to return our test database
vi.mock('../../packages/server/src/db/index', () => ({
  getDb: () => testDbInstance,
  getStoragePath: () => TEST_DB_PATH,
}))

// Helper to get the actual database instance
function getTestDb(): DatabaseSync {
  if (!testDbInstance) {
    throw new Error('Test database not initialized. Call beforeAll() first.')
  }
  return testDbInstance
}

// Helper to check if table exists
function tableExists(db: DatabaseSync, tableName: string): boolean {
  const result = db.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
  ).get(tableName)
  return !!result
}

// Helper to get table columns
function getTableColumns(db: DatabaseSync, tableName: string): Map<string, string> {
  const columns = db.prepare(`PRAGMA table_info("${tableName}")`).all() as Array<{
    name: string
    type: string
    pk: number
  }>
  const columnMap = new Map<string, string>()
  for (const col of columns) {
    columnMap.set(col.name, col.type)
  }
  return columnMap
}

// Helper to get table primary key from SQL
function getTablePrimaryKey(db: DatabaseSync, tableName: string): string | null {
  const tableInfo = db.prepare(
    `SELECT sql FROM sqlite_master WHERE type='table' AND name=?`
  ).get(tableName) as { sql: string } | undefined

  const sql = tableInfo?.sql || ''

  // First, check for composite primary key: PRIMARY KEY (col1, col2)
  const pkMatch = sql.match(/PRIMARY KEY\s*\(([^)]+)\)/i)
  if (pkMatch) {
    return pkMatch[1].replace(/\s+/g, '')
  }

  // Then, check for inline primary key: col TEXT PRIMARY KEY
  const inlinePkMatch = sql.match(/"(\w+)"\s+\w+\s+PRIMARY KEY/i)
  if (inlinePkMatch) {
    return inlinePkMatch[1]
  }

  return null
}

describe('Database Schema Synchronization', () => {
  beforeAll(() => {
    // Create test directory
    if (!existsSync(TEST_DB_DIR)) {
      mkdirSync(TEST_DB_DIR, { recursive: true })
    }
  })

  beforeEach(() => {
    // Clean up any existing test database
    try { unlinkSync(TEST_DB_PATH) } catch {}
    try { unlinkSync(TEST_DB_PATH + '-wal') } catch {}
    try { unlinkSync(TEST_DB_PATH + '-shm') } catch {}

    // Create new test database
    testDbInstance = new DatabaseSync(TEST_DB_PATH)
    testDbInstance.exec('PRAGMA journal_mode=WAL')
    testDbInstance.exec('PRAGMA synchronous=NORMAL')

    // Reset modules to ensure fresh imports
    vi.resetModules()
  })

  afterEach(() => {
    // Close test database
    if (testDbInstance) {
      testDbInstance.close()
      testDbInstance = null
    }

    // Clean up test database and backup files
    try { unlinkSync(TEST_DB_PATH) } catch {}
    try { unlinkSync(TEST_DB_PATH + '-wal') } catch {}
    try { unlinkSync(TEST_DB_PATH + '-shm') } catch {}
  })

  describe('Normal initialization - fresh database creation', () => {
    it('creates all tables with correct schemas when database does not exist', async () => {
      const { initAllHermesTables, USAGE_TABLE, USAGE_SCHEMA, SESSIONS_TABLE, SESSIONS_SCHEMA } =
        await import('../../packages/server/src/db/hermes/schemas')

      initAllHermesTables()

      const db = getTestDb()

      // Verify USAGE_TABLE was created
      expect(tableExists(db, USAGE_TABLE)).toBe(true)

      // Verify USAGE_TABLE has correct columns
      const usageCols = getTableColumns(db, USAGE_TABLE)
      expect(usageCols.size).toBe(Object.keys(USAGE_SCHEMA).length)
      expect(usageCols.has('id')).toBe(true)
      expect(usageCols.has('session_id')).toBe(true)
      expect(usageCols.has('input_tokens')).toBe(true)

      // Verify SESSIONS_TABLE was created
      expect(tableExists(db, SESSIONS_TABLE)).toBe(true)

      // Verify SESSIONS_TABLE has correct columns
      const sessionsCols = getTableColumns(db, SESSIONS_TABLE)
      expect(sessionsCols.size).toBe(Object.keys(SESSIONS_SCHEMA).length)
      expect(sessionsCols.has('id')).toBe(true)
      expect(sessionsCols.has('profile')).toBe(true)
      expect(sessionsCols.has('source')).toBe(true)
    })
  })

  describe('Safe additive schema changes', () => {
    it('adds missing safe columns to existing table without rebuilding', async () => {
      const { syncTable, USAGE_TABLE, USAGE_SCHEMA } = await import('../../packages/server/src/db/hermes/schemas')

      // Create initial table without some columns
      const db = getTestDb()
      db.exec(`CREATE TABLE "${USAGE_TABLE}" (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, created_at INTEGER NOT NULL)`)

      // Insert test data
      db.prepare(`INSERT INTO "${USAGE_TABLE}" (session_id, created_at) VALUES (?, ?)`).run('test-1', Date.now())

      // Sync with full schema
      syncTable(USAGE_TABLE, USAGE_SCHEMA, { primaryKey: 'id' })

      // Verify safe missing columns now exist
      const cols = getTableColumns(db, USAGE_TABLE)
      expect(cols.has('input_tokens')).toBe(true)
      expect(cols.has('output_tokens')).toBe(true)
      expect(cols.has('cache_read_tokens')).toBe(true)
      expect(cols.has('cache_write_tokens')).toBe(true)

      // Verify data integrity (should be preserved)
      const row = db.prepare(`SELECT * FROM "${USAGE_TABLE}" WHERE session_id = ?`).get('test-1')
      expect(row).toBeTruthy()
      expect(row.session_id).toBe('test-1')
    })

    it('adds created_at to legacy session_usage tables missing the column', async () => {
      const { syncTable, USAGE_TABLE, USAGE_SCHEMA } = await import('../../packages/server/src/db/hermes/schemas')

      const db = getTestDb()
      db.exec(`CREATE TABLE "${USAGE_TABLE}" (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL)`)
      db.prepare(`INSERT INTO "${USAGE_TABLE}" (session_id) VALUES (?)`).run('legacy-session')

      syncTable(USAGE_TABLE, USAGE_SCHEMA, { primaryKey: 'id' })

      const cols = getTableColumns(db, USAGE_TABLE)
      expect(cols.has('created_at')).toBe(true)

      const row = db.prepare(`SELECT session_id, created_at FROM "${USAGE_TABLE}" WHERE session_id = ?`).get('legacy-session')
      expect(row).toMatchObject({ session_id: 'legacy-session', created_at: 0 })
    })
  })

  describe('Destructive schema changes are not applied automatically', () => {
    it('does not rebuild table when column types differ', async () => {
      const { syncTable, USAGE_TABLE, USAGE_SCHEMA } = await import('../../packages/server/src/db/hermes/schemas')

      const db = getTestDb()

      // Create table with wrong column type (INTEGER instead of TEXT for session_id)
      db.exec(`CREATE TABLE "${USAGE_TABLE}" (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER NOT NULL, created_at INTEGER NOT NULL)`)

      // Insert test data
      db.prepare(`INSERT INTO "${USAGE_TABLE}" (session_id, created_at) VALUES (?, ?)`).run(12345, Date.now())

      // Sync with correct schema
      syncTable(USAGE_TABLE, USAGE_SCHEMA, { primaryKey: 'id' })

      // Verify column type was left untouched
      const cols = getTableColumns(db, USAGE_TABLE)
      expect(cols.get('session_id')).toBe('INTEGER')

      // Verify data was preserved
      const rows = db.prepare(`SELECT COUNT(*) as count FROM "${USAGE_TABLE}"`).get() as { count: number }
      expect(rows.count).toBe(1)
    })
  })

  describe('Index synchronization', () => {
    it('creates specified indexes on table', async () => {
      const { syncTable, MESSAGES_TABLE, MESSAGES_SCHEMA } =
        await import('../../packages/server/src/db/hermes/schemas')

      syncTable(MESSAGES_TABLE, MESSAGES_SCHEMA, {
        indexes: {
          idx_messages_session_id: 'CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id)',
        },
      })

      const db = getTestDb()

      // Verify index was created
      const indexes = db.prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name=?`).get('idx_messages_session_id')
      expect(indexes).toBeTruthy()
    })

    it('does not alter indexes on existing tables', async () => {
      const { syncTable, MESSAGES_TABLE, MESSAGES_SCHEMA } =
        await import('../../packages/server/src/db/hermes/schemas')

      const db = getTestDb()

      // Create table and an extra index
      db.exec(`CREATE TABLE "${MESSAGES_TABLE}" (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, content TEXT)`)
      db.exec(`CREATE INDEX idx_extra ON "${MESSAGES_TABLE}"(content)`)

      // Sync without the extra index
      syncTable(MESSAGES_TABLE, MESSAGES_SCHEMA, {
        indexes: {
          idx_messages_session_id: 'CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id)',
        },
      })

      // Verify extra index remains
      const extraIndex = db.prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name=?`).get('idx_extra')
      expect(extraIndex).toBeTruthy()

      // Verify expected index was not added to an existing table
      const correctIndex = db.prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name=?`).get('idx_messages_session_id')
      expect(correctIndex).toBeFalsy()
    })
  })

  describe('Data preservation during schema sync', () => {
    it('preserves data when adding safe columns', async () => {
      const { syncTable, USAGE_TABLE, USAGE_SCHEMA } = await import('../../packages/server/src/db/hermes/schemas')

      const db = getTestDb()

      // Create minimal table
      db.exec(`CREATE TABLE "${USAGE_TABLE}" (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, created_at INTEGER NOT NULL)`)

      // Insert test data (only columns that exist)
      const sessionId = 'test-session-123'
      db.prepare(`INSERT INTO "${USAGE_TABLE}" (session_id, created_at) VALUES (?, ?)`).run(sessionId, Date.now())

      // Sync with full schema (should add safe columns only)
      syncTable(USAGE_TABLE, USAGE_SCHEMA, { primaryKey: 'id' })

      // Verify data is still there
      const row = db.prepare(`SELECT * FROM "${USAGE_TABLE}" WHERE session_id = ?`).get(sessionId)
      expect(row).toBeTruthy()
      expect(row.session_id).toBe(sessionId)

      const cols = getTableColumns(db, USAGE_TABLE)
      expect(cols.has('input_tokens')).toBe(true)
    })
  })

  describe('Column preservation', () => {
    it('keeps extra columns on existing table', async () => {
      const { syncTable, USAGE_TABLE, USAGE_SCHEMA } = await import('../../packages/server/src/db/hermes/schemas')

      // Create table with extra columns
      const db = getTestDb()
      db.exec(`CREATE TABLE "${USAGE_TABLE}" (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, created_at INTEGER NOT NULL, extra_col TEXT, another_extra INTEGER)`)

      // Insert test data (only for columns that exist)
      db.prepare(`INSERT INTO "${USAGE_TABLE}" (session_id, created_at, extra_col, another_extra) VALUES (?, ?, ?, ?)`)
        .run('test-1', Date.now(), 'value', 123)

      // Sync with schema (should keep extra columns)
      syncTable(USAGE_TABLE, USAGE_SCHEMA, { primaryKey: 'id' })

      // Verify extra columns are preserved
      const cols = getTableColumns(db, USAGE_TABLE)
      expect(cols.has('extra_col')).toBe(true)
      expect(cols.has('another_extra')).toBe(true)

      // Verify data is still there
      const row = db.prepare(`SELECT * FROM "${USAGE_TABLE}" WHERE session_id = ?`).get('test-1')
      expect(row).toBeTruthy()
      expect(row.session_id).toBe('test-1')
    })
  })
})
