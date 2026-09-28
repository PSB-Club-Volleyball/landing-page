// A minimal D1Database stand-in over an in-memory node:sqlite database —
// only the surface functions/** actually use: prepare().bind() with
// first()/all()/run(), and batch() as one transaction.
import { readdirSync, readFileSync } from 'node:fs'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'

const MIGRATIONS_DIR = new URL('../migrations/', import.meta.url)

interface D1Meta {
  changes: number
  last_row_id: number
}

export interface D1Result<T = Record<string, unknown>> {
  success: true
  results: T[]
  meta: D1Meta
}

// D1 rejects undefined (and objects) outright; booleans become 0/1. Integral
// numbers are bound as INTEGER — node:sqlite would otherwise bind every JS
// number as REAL.
export function toSqlite(value: unknown): SQLInputValue {
  if (value === null || typeof value === 'string' || typeof value === 'bigint') return value
  if (typeof value === 'boolean') return value ? 1n : 0n
  if (typeof value === 'number') return Number.isSafeInteger(value) ? BigInt(value) : value
  if (value instanceof Uint8Array) return value
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  throw new TypeError(`D1_TYPE_ERROR: Type '${value === undefined ? 'undefined' : typeof value}' not supported`)
}

export class TestD1PreparedStatement {
  readonly db: TestD1Database
  readonly sql: string
  readonly params: SQLInputValue[]

  constructor(db: TestD1Database, sql: string, params: SQLInputValue[] = []) {
    this.db = db
    this.sql = sql
    this.params = params
  }

  bind(...values: unknown[]): TestD1PreparedStatement {
    return new TestD1PreparedStatement(this.db, this.sql, values.map(toSqlite))
  }

  // Synchronous on purpose: batch() runs every statement inside one
  // BEGIN/COMMIT with nothing else interleaved.
  execute(): D1Result {
    const sqlite = this.db.sqlite
    let stmt
    try {
      stmt = sqlite.prepare(this.sql)
      // RETURNING statements have result columns too, so they go through all().
      // changes() / run().changes are sqlite3_changes(): like D1's
      // meta.changes they exclude rows touched by FK cascades and triggers.
      if (stmt.columns().length > 0) {
        const results = stmt.all(...this.params).map((row) => ({ ...row }))
        const after = sqlite.prepare('SELECT changes() AS n, last_insert_rowid() AS id').get()!
        return { success: true, results, meta: { changes: Number(after.n), last_row_id: Number(after.id) } }
      }
      const run = stmt.run(...this.params)
      return { success: true, results: [], meta: { changes: Number(run.changes), last_row_id: Number(run.lastInsertRowid) } }
    } catch (e) {
      // D1 surfaces SQLite errors as "D1_ERROR: <sqlite message>".
      throw new Error(`D1_ERROR: ${(e as Error).message}`, { cause: e })
    }
  }

  async first<T = Record<string, unknown>>(column?: string): Promise<T | null> {
    const row = this.execute().results[0]
    if (row === undefined) return null
    if (column === undefined) return row as T
    if (!(column in row)) throw new Error(`D1_COLUMN_NOTFOUND: Column not found (${column})`)
    return row[column] as T
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return this.execute() as D1Result<T>
  }

  async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return this.execute() as D1Result<T>
  }
}

export class TestD1Database {
  readonly sqlite: DatabaseSync

  constructor(sqlite: DatabaseSync) {
    this.sqlite = sqlite
  }

  prepare(sql: string): TestD1PreparedStatement {
    return new TestD1PreparedStatement(this, sql)
  }

  async batch(statements: TestD1PreparedStatement[]): Promise<D1Result[]> {
    this.sqlite.exec('BEGIN')
    try {
      const results = statements.map((s) => s.execute())
      this.sqlite.exec('COMMIT')
      return results
    } catch (e) {
      this.sqlite.exec('ROLLBACK')
      throw e
    }
  }
}

// A fresh database with every migration applied in filename order, foreign
// keys enforced like D1. The open-gym events 0002 seeds are removed so each
// test starts from an empty calendar (login_settings and the seeded form stay).
export function createTestDb(): TestD1Database {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec('PRAGMA foreign_keys = ON')
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  for (const file of files) {
    try {
      sqlite.exec(readFileSync(new URL(file, MIGRATIONS_DIR), 'utf8'))
    } catch (e) {
      throw new Error(`Migration ${file} failed: ${(e as Error).message}`, { cause: e })
    }
  }
  sqlite.exec('DELETE FROM events')
  return new TestD1Database(sqlite)
}
