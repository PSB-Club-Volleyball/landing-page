import type { Env } from '../_lib/env'
import { badRequest, json } from '../_lib/http'
import type { AdminData } from './_lib/types'
import { logAudit } from './_lib/audit'
import { ensureRosterEntry } from './_lib/roster'
import { emailTaken, normalizeEmail } from './_lib/userEmails'

const COLUMNS = `id, email, name, avatar_url, provider, role, position, team, skill_level,
                 skill_level_locked, skill_level_change_requested, waiver_signed_year, waiver_signed_at,
                 dues_paid_year, dues_paid_at, rsvp_restricted, created_at`

// GET /api/admin/users -> every account, newest first, each with all of its
// emails (primary first). provider 'none' = added by an admin, not signed
// into yet.
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const [users, emails] = await env.DB.batch([
    env.DB.prepare(`SELECT ${COLUMNS} FROM users ORDER BY created_at DESC`),
    env.DB.prepare(`SELECT user_id, email FROM user_emails ORDER BY created_at ASC, email ASC`),
  ])

  const emailsByUser = new Map<number, string[]>()
  for (const row of emails.results as { user_id: number; email: string }[]) {
    emailsByUser.set(row.user_id, [...(emailsByUser.get(row.user_id) ?? []), row.email])
  }

  const rows = users.results as (Record<string, unknown> & {
    id: number
    email: string
    rsvp_restricted: number
    skill_level_locked: number
  })[]
  return json({
    users: rows.map((u) => {
      const own = emailsByUser.get(u.id)
      // Migration 0033's insert trigger gives every account its primary email.
      if (!own) throw new Error(`User ${u.id} has no user_emails rows`)
      const primary = u.email.toLowerCase()
      return {
        ...u,
        rsvp_restricted: Boolean(u.rsvp_restricted),
        skill_level_locked: Boolean(u.skill_level_locked),
        emails: [primary, ...own.filter((e) => e !== primary)],
      }
    }),
  })
}

interface CreateInput {
  name?: unknown
  email?: unknown
  role?: unknown
  waiver_signed?: unknown
}

const CREATABLE_ROLES = ['outsider', 'club_member', 'admin']

// POST /api/admin/users  Body: { name, email, role?, waiver_signed? }
// Adds an account before its owner has signed in (e.g. from a paper waiver
// list). Its first sign-in with a provider that vouches for this email
// claims it (auth/_lib/accounts.ts); until then provider is 'none'. Role
// defaults to outsider; only the owner can create an admin, same as
// promoting one in PUT /api/admin/users/:id.
export const onRequestPost: PagesFunction<Env, string, AdminData> = async ({ request, env, data }) => {
  const body = await request.json<CreateInput>().catch(() => null)
  if (!body) return badRequest('Invalid JSON body')

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return badRequest('name is required')
  const email = normalizeEmail(body.email)
  if (!email) return badRequest('email must be an email address')
  const role = body.role === undefined ? 'outsider' : body.role
  if (typeof role !== 'string' || !CREATABLE_ROLES.includes(role)) {
    return badRequest(`role must be one of ${CREATABLE_ROLES.join(', ')}`)
  }
  if (role === 'admin' && data.user.role !== 'owner') return badRequest('Only the owner can grant admin')
  if (body.waiver_signed !== undefined && typeof body.waiver_signed !== 'boolean') {
    return badRequest('waiver_signed must be a boolean')
  }
  const waiver = body.waiver_signed === true

  const taken = await emailTaken(env, email)
  if (taken) return taken

  const inserted = await env.DB.prepare(
    `INSERT INTO users (email, name, provider, provider_sub, role,
                        waiver_signed_year, waiver_signed_by, waiver_signed_at)
     VALUES (?1, ?2, 'none', ?3, ?4, ?5, ?6, CASE WHEN ?5 IS NULL THEN NULL ELSE CURRENT_TIMESTAMP END)`
  )
    .bind(
      email,
      name,
      `none:${email}`,
      role,
      waiver ? new Date().getUTCFullYear() : null,
      waiver ? data.user.id : null
    )
    .run()
  const id = Number(inserted.meta.last_row_id)

  await logAudit(env, data.user.id, 'create', 'users', id, { name, email, role, waiver_signed: waiver })
  if (role === 'club_member' || role === 'admin') await ensureRosterEntry(env, id)
  return json({ ok: true, id }, { status: 201 })
}
