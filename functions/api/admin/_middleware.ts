import type { Env } from '../_lib/env'
import { forbidden, unauthorized } from '../_lib/http'
import { getSessionUser } from '../_lib/session'
import type { AdminData } from './_lib/types'

// Gates every /api/admin/* route: no session -> 401, session but not yet
// approved -> 403. Approved user gets attached to context.data for handlers.
export const onRequest: PagesFunction<Env, string, AdminData> = async (context) => {
  const user = await getSessionUser(context.request, context.env)
  if (!user) return unauthorized()
  if (user.status !== 'approved') return forbidden('Your account is pending approval')

  context.data.user = user
  return context.next()
}
