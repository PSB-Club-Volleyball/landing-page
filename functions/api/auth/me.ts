import type { Env } from '../_lib/env'
import { json } from '../_lib/http'
import { getSessionUser } from '../_lib/session'

// GET /api/auth/me -> who (if anyone) the current session cookie belongs to.
// Drives the SPA: no user = show sign-in, status=pending = show waiting
// screen, status=approved = show the admin console.
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getSessionUser(request, env)
  if (!user) return json({ user: null })

  return json({
    user: {
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      provider: user.provider,
      status: user.status,
      role: user.role,
    },
  })
}
