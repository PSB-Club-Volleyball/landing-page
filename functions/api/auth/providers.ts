import type { Env } from '../_lib/env'
import { json } from '../_lib/http'
import { isPreviewDeployment } from '../_lib/preview'
import { getLoginSettings } from './_lib/settings'

// GET /api/auth/providers -> which OAuth providers currently accept new
// sign-ins, so the public sign-in UI can hide a provider an owner disabled.
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  // Sign-in can't complete on ephemeral preview deploys (see _lib/preview.ts),
  // so report every provider as unavailable rather than show a button that
  // dead-ends at an invalid_state redirect.
  if (isPreviewDeployment(request)) return json({ google: false, microsoft: false, microsoft_other: false })

  const settings = await getLoginSettings(env)
  return json({
    google: settings.google_enabled,
    microsoft: settings.microsoft_enabled,
    microsoft_other: settings.microsoft_other_enabled,
  })
}
