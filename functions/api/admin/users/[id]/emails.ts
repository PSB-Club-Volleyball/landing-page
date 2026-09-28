import type { Env } from '../../../_lib/env'
import { badRequest, json, notFound } from '../../../_lib/http'
import type { AdminData } from '../../_lib/types'
import { logAudit } from '../../_lib/audit'
import { emailTaken, normalizeEmail } from '../../_lib/userEmails'

// POST /api/admin/users/:id/emails  Body: { email }
// Adds another email to an account, so signups under it count as this
// person's. It never lets anyone sign in with it (see canClaim in
// auth/_lib/accounts.ts); an admin's or the owner's emails are still
// owner-only, like granting admin in PUT /api/admin/users/:id.
export const onRequestPost: PagesFunction<Env, 'id', AdminData> = async ({ request, env, params, data }) => {
  const id = Number(params.id)
  if (!Number.isInteger(id)) return badRequest('Invalid id')
  const body = await request.json<{ email?: unknown }>().catch(() => null)
  if (!body) return badRequest('Invalid JSON body')
  const email = normalizeEmail(body.email)
  if (!email) return badRequest('email must be an email address')

  const target = await env.DB.prepare(`SELECT role FROM users WHERE id = ?1`).bind(id).first<{ role: string }>()
  if (!target) return notFound('User not found')
  if ((target.role === 'owner' || target.role === 'admin') && data.user.role !== 'owner') {
    return badRequest("Only the owner can add emails to an admin's account")
  }

  const taken = await emailTaken(env, email)
  if (taken) return taken

  await env.DB.prepare(`INSERT INTO user_emails (email, user_id) VALUES (?1, ?2)`).bind(email, id).run()
  await logAudit(env, data.user.id, 'update', 'users', id, { email_added: email })
  return json({ ok: true }, { status: 201 })
}
