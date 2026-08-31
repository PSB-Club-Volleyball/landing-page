import type { Env } from '../_lib/env'
import { json } from '../_lib/http'
import { getLoginSettings } from './_lib/settings'

// GET /api/auth/providers -> which OAuth providers currently accept new
// sign-ins, so the public sign-in UI can hide a provider an owner disabled.
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const settings = await getLoginSettings(env)
  return json({ google: settings.google_enabled, microsoft: settings.microsoft_enabled })
}
