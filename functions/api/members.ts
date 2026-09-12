import type { Env } from './_lib/env'
import { json, unauthorized } from './_lib/http'
import { getSessionUser } from './_lib/session'
import { getPlayerResults, getPlayerSummary } from './_lib/playerResults'

// GET /api/members -> every signed-in account (club member or outsider),
// with results if they've played a match, ranked by win rate. Backs both
// the People directory (everyone, searchable) and the Leaderboard (filtered
// client-side to players with a match played). Never includes skill level,
// club status, or RSVPs; see functions/api/members/[id].ts for one
// account's public results.
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const sessionUser = await getSessionUser(request, env)
  if (!sessionUser) return unauthorized()

  const userRows = await env.DB.prepare(`SELECT id, name, email, avatar_url FROM users`).all<{
    id: number
    name: string | null
    email: string
    avatar_url: string | null
  }>()

  const members = []
  for (const u of userRows.results ?? []) {
    const results = await getPlayerResults(env, u.email)
    const summary = getPlayerSummary(results)
    members.push({
      id: u.id,
      name: u.name,
      avatarUrl: u.avatar_url,
      wins: summary.wins,
      losses: summary.losses,
      setsWon: summary.setsWon,
      setsLost: summary.setsLost,
      winPct: summary.winPct,
      currentStreak: summary.currentStreak,
    })
  }

  members.sort((a, b) => {
    if (b.winPct !== a.winPct) return b.winPct - a.winPct
    if (b.wins !== a.wins) return b.wins - a.wins
    const aDiff = a.setsWon - a.setsLost
    const bDiff = b.setsWon - b.setsLost
    if (bDiff !== aDiff) return bDiff - aDiff
    return (a.name ?? '').localeCompare(b.name ?? '')
  })

  return json({ members })
}
