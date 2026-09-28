// Fixtures and request helpers shared by the API tests. Handlers are called
// directly with a Pages-shaped context; nothing listens on a port.
import { createHash, randomBytes } from 'node:crypto'
import { createTestDb, type TestD1Database, toSqlite } from './d1.ts'
import { onRequest as adminMiddleware } from '../functions/api/admin/_middleware.ts'

export const PUBLIC_URL = 'https://test.example'

// --- outbound email -------------------------------------------------------
// sendEmail posts to Resend with fetch. Capture those posts so tests can
// count them; any other outbound request is a test bug and throws.
export interface SentEmail {
  to: string
  subject: string
}
export const sentEmails: SentEmail[] = []
globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
  const url = input instanceof Request ? input.url : String(input)
  if (url !== 'https://api.resend.com/emails') throw new Error(`Unexpected outbound fetch in a test: ${url}`)
  const body = JSON.parse(String(init?.body)) as SentEmail
  sentEmails.push({ to: body.to, subject: body.subject })
  return new Response(JSON.stringify({ id: `email-${sentEmails.length}` }), { status: 200 })
}

// --- time -----------------------------------------------------------------
const eastern = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

// Eastern wall-clock "YYYY-MM-DDTHH:MM" for now + `hours` (negative = past),
// the format events store their times in.
export function wallClock(hours: number): string {
  const parts = eastern.formatToParts(new Date(Date.now() + hours * 3_600_000))
  const get = (type: string) => {
    const part = parts.find((p) => p.type === type)
    if (!part) throw new Error(`Intl gave no ${type} part`)
    return part.value
  }
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}

// --- environment ----------------------------------------------------------
export interface TestEnv {
  DB: TestD1Database
  MEDIA_BUCKET: unknown
  [key: string]: unknown
}

// R2 isn't exercised by these tests; touching it is a bug in the test.
const noBucket = new Proxy(
  {},
  {
    get(_target, prop) {
      throw new Error(`MEDIA_BUCKET.${String(prop)} used, but the tests don't stub R2`)
    },
  }
)

export function setup(): { db: TestD1Database; env: TestEnv } {
  const db = createTestDb()
  sentEmails.length = 0
  const env: TestEnv = {
    DB: db,
    MEDIA_BUCKET: noBucket,
    PUBLIC_URL,
    ADMIN_BOOTSTRAP_EMAILS: '',
    GOOGLE_CLIENT_ID: 'test',
    GOOGLE_CLIENT_SECRET: 'test',
    MICROSOFT_TENANT_ID: 'test-tenant',
    MICROSOFT_CLIENT_ID: 'test',
    MICROSOFT_CLIENT_SECRET: 'test',
    MICROSOFT_OTHER_CLIENT_ID: 'test',
    MICROSOFT_OTHER_CLIENT_SECRET: 'test',
    EVENTS_EMAIL_FROM: 'events@test.example',
    RESEND_API_KEY: 'test-key',
  }
  return { db, env }
}

// Runs one statement against the raw SQLite handle (fixtures, assertions).
export function sql(db: TestD1Database, query: string, ...params: (string | number | null)[]) {
  return db.sqlite.prepare(query).all(...params.map(toSqlite)).map((row) => ({ ...row }))
}

function insert(db: TestD1Database, table: string, row: Record<string, string | number | null>): number {
  const cols = Object.keys(row)
  const result = db.sqlite
    .prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
    .run(...Object.values(row).map(toSqlite))
  return Number(result.lastInsertRowid)
}

// --- fixtures -------------------------------------------------------------
export type Role = 'outsider' | 'club_member' | 'admin' | 'owner'

export interface SeededUser {
  id: number
  email: string
  cookie: string
}

// A user plus a live session. The cookie value is the raw token; the DB keeps
// its sha256 hex, as auth/[provider]/callback.ts writes it.
export function seedUser(db: TestD1Database, opts: { email: string; role: Role; name?: string }): SeededUser {
  const id = insert(db, 'users', {
    email: opts.email,
    name: opts.name ?? opts.email.split('@')[0],
    provider: 'google',
    provider_sub: opts.email,
    role: opts.role,
  })
  const token = randomBytes(24).toString('base64url')
  insert(db, 'sessions', {
    user_id: id,
    token_hash: createHash('sha256').update(token).digest('hex'),
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  })
  return { id, email: opts.email, cookie: `session=${token}` }
}

export function seedEvent(db: TestD1Database, overrides: Record<string, string | number | null> = {}): number {
  return insert(db, 'events', {
    title: 'Test event',
    event_type: 'open_gym',
    start_time: wallClock(24),
    end_time: wallClock(26),
    status: 'published',
    visibility: 'public',
    signup_enabled: 1,
    ...overrides,
  })
}

export function seedSignup(
  db: TestD1Database,
  eventId: number,
  opts: { name?: string; email: string; status?: string; cancel_token?: string }
): number {
  return insert(db, 'event_signups', {
    event_id: eventId,
    name: opts.name ?? opts.email.split('@')[0],
    email: opts.email,
    status: opts.status ?? 'approved',
    cancel_token: opts.cancel_token ?? randomBytes(16).toString('hex'),
  })
}

// A team with linked accounts as members (event_team_members.user_id).
export function seedTeam(
  db: TestD1Database,
  eventId: number,
  opts: { name: string; seed: number; userIds?: number[]; published?: boolean; pool?: string | null }
): number {
  const teamId = insert(db, 'event_teams', {
    event_id: eventId,
    name: opts.name,
    seed: opts.seed,
    pool: opts.pool ?? null,
    published: opts.published === false ? 0 : 1,
  })
  for (const userId of opts.userIds ?? []) {
    insert(db, 'event_team_members', { team_id: teamId, user_id: userId, display_name: `member ${userId}` })
  }
  return teamId
}

export function seedMatch(db: TestD1Database, eventId: number, row: Record<string, string | number | null>): number {
  return insert(db, 'event_matches', { event_id: eventId, bracket: 'pool', ...row })
}

export function seedMedia(db: TestD1Database, eventId: number | null, key: string): number {
  return insert(db, 'media', { r2_key: key, media_type: 'photo', event_id: eventId })
}

// --- calling handlers -----------------------------------------------------
// Handlers are typed against workers-types' EventContext; any context-shaped object works at runtime.
type Handler = (context: any) => Response | Promise<Response>

export interface CallOptions {
  path?: string
  method?: string
  params?: Record<string, string | number>
  cookie?: string
  body?: unknown
  data?: Record<string, unknown>
}

function buildContext(env: TestEnv, opts: CallOptions) {
  const headers: Record<string, string> = {}
  if (opts.cookie) headers.cookie = opts.cookie
  if (opts.body !== undefined) headers['content-type'] = 'application/json'
  const request = new Request(`${PUBLIC_URL}${opts.path ?? '/api/test'}`, {
    method: opts.method ?? (opts.body === undefined ? 'GET' : 'POST'),
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })
  const params = Object.fromEntries(Object.entries(opts.params ?? {}).map(([k, v]) => [k, String(v)]))
  return {
    request,
    env,
    params,
    data: opts.data ?? {},
    next: (): Promise<Response> => {
      throw new Error('next() called outside a middleware chain')
    },
    waitUntil: () => {},
    passThroughOnException: () => {},
  }
}

export async function call(handler: Handler, env: TestEnv, opts: CallOptions = {}): Promise<Response> {
  return handler(buildContext(env, opts))
}

// An /api/admin/* route as Pages runs it: the admin middleware first, which
// sets data.user and hands off to the route.
export async function callAdmin(handler: Handler, env: TestEnv, opts: CallOptions = {}): Promise<Response> {
  const context = buildContext(env, opts)
  context.next = async () => handler(context)
  return adminMiddleware(context as unknown as Parameters<typeof adminMiddleware>[0])
}

export async function body<T = Record<string, unknown>>(res: Response): Promise<T> {
  return (await res.json()) as T
}
