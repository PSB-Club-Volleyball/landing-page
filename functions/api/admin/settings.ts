import type { Env } from '../_lib/env'
import { badRequest, json } from '../_lib/http'
import type { AdminData } from './_lib/types'
import { logAudit } from './_lib/audit'
import { requireOwner } from './_lib/permissions'
import { getLoginSettings } from '../auth/_lib/settings'

// GET /api/admin/settings -> current login-provider toggles (owner only)
export const onRequestGet: PagesFunction<Env, string, AdminData> = async ({ env, data }) => {
  const denied = requireOwner(data)
  if (denied) return denied

  const settings = await getLoginSettings(env)
  return json(settings)
}

interface SettingsInput {
  google_enabled: boolean
  microsoft_enabled: boolean
}

// PUT /api/admin/settings -> toggle which OAuth providers accept new sign-ins.
// At least one must stay enabled, or nobody could ever sign in again.
export const onRequestPut: PagesFunction<Env, string, AdminData> = async ({ request, env, data }) => {
  const denied = requireOwner(data)
  if (denied) return denied

  const body = await request.json<Partial<SettingsInput>>().catch(() => null)
  if (!body || typeof body.google_enabled !== 'boolean' || typeof body.microsoft_enabled !== 'boolean') {
    return badRequest('google_enabled and microsoft_enabled are required booleans')
  }
  if (!body.google_enabled && !body.microsoft_enabled) {
    return badRequest('At least one sign-in provider must stay enabled')
  }

  await env.DB.prepare(`UPDATE login_settings SET google_enabled = ?1, microsoft_enabled = ?2 WHERE id = 1`)
    .bind(body.google_enabled ? 1 : 0, body.microsoft_enabled ? 1 : 0)
    .run()

  await logAudit(env, data.user.id, 'update', 'login_settings', null, body)
  return json({ ok: true })
}
