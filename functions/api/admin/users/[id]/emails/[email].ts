import type { Env } from '../../../../_lib/env'
import { badRequest, json, notFound } from '../../../../_lib/http'
import type { AdminData } from '../../../_lib/types'
import { logAudit } from '../../../_lib/audit'

// DELETE /api/admin/users/:id/emails/:email  Removes one of an account's
// emails. The primary email can't be removed (pick another primary first),
// so an account always keeps at least one. Signups under the removed email
// stop counting as this person's; logins already attached stay.
export const onRequestDelete: PagesFunction<Env, 'id' | 'email', AdminData> = async ({ env, params, data }) => {
  const id = Number(params.id)
  if (!Number.isInteger(id)) return badRequest('Invalid id')
  const email = decodeURIComponent(String(params.email)).trim().toLowerCase()

  const target = await env.DB.prepare(`SELECT role, email FROM users WHERE id = ?1`)
    .bind(id)
    .first<{ role: string; email: string }>()
  if (!target) return notFound('User not found')
  if (target.role === 'owner' && data.user.role !== 'owner') {
    return badRequest("Only the owner can change the owner's emails")
  }
  if (target.email.toLowerCase() === email) {
    return badRequest("That's the primary email — make another email primary first")
  }

  const result = await env.DB.prepare(`DELETE FROM user_emails WHERE user_id = ?1 AND email = ?2`)
    .bind(id, email)
    .run()
  if (result.meta.changes === 0) return notFound("That email isn't on this account")

  await logAudit(env, data.user.id, 'update', 'users', id, { email_removed: email })
  return json({ ok: true })
}
