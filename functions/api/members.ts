import type { Env } from './_lib/env'
import { json, unauthorized } from './_lib/http'
import { getSessionUser } from './_lib/session'
import { getPlayerResultsByUser, getPlayerSummary } from './_lib/playerResults'
import { getLoginSettings } from './auth/_lib/settings'
import type { StripeSkill } from './_lib/stripes'

// GET /api/members -> every signed-in account (club member or outsider),
// with results if they've played a match, ranked by win rate. Backs both
// the People directory (everyone, searchable) and the Leaderboard (filtered
// client-side to players with a match played). Never includes skill level,
// club status, or RSVPs; see functions/api/members/[id].ts for one
// account's public results. Also carries each account's position, latest
// roster class year, stripe counts, and how many events they shared a team
// with the viewer — People shows those instead of records.
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const sessionUser = await getSessionUser(request, env)
  if (!sessionUser) return unauthorized()

  const [userRows, classRows, stripeRows, sharedRows] = await env.DB.batch([
    env.DB.prepare(`SELECT id, name, email, avatar_url, position FROM users`),
    // Latest season's class year for accounts on the roster.
    env.DB.prepare(
      `SELECT r.user_id, r.class_year FROM roster r
       WHERE r.user_id IS NOT NULL
         AND r.season = (SELECT MAX(r2.season) FROM roster r2 WHERE r2.user_id = r.user_id)`
    ),
    env.DB.prepare(`SELECT receiver_id, skill, COUNT(*) AS n FROM stripes GROUP BY receiver_id, skill`),
    // Events where the viewer and this account were linked to the same
    // published team.
    env.DB.prepare(
      `SELECT mb.user_id, COUNT(DISTINCT et.event_id) AS n
       FROM event_team_members ma
       JOIN event_team_members mb ON mb.team_id = ma.team_id
       JOIN event_teams et ON et.id = ma.team_id
       WHERE et.published = 1 AND ma.user_id = ?1 AND mb.user_id IS NOT NULL AND mb.user_id <> ?1
       GROUP BY mb.user_id`
    ).bind(sessionUser.id),
  ])
  const users = userRows.results as {
    id: number
    name: string | null
    email: string
    avatar_url: string | null
    position: string | null
  }[]
  // Class year comes from the roster, so it follows the owner's hide-roster
  // setting like /api/roster does.
  const { roster_visible } = await getLoginSettings(env)
  const classYear = new Map(
    roster_visible
      ? (classRows.results as { user_id: number; class_year: string | null }[]).map((r) => [r.user_id, r.class_year])
      : []
  )
  const stripes = new Map<number, Partial<Record<StripeSkill, number>>>()
  for (const r of stripeRows.results as { receiver_id: number; skill: StripeSkill; n: number }[]) {
    const counts = stripes.get(r.receiver_id) ?? {}
    counts[r.skill] = r.n
    stripes.set(r.receiver_id, counts)
  }
  const shared = new Map((sharedRows.results as { user_id: number; n: number }[]).map((r) => [r.user_id, r.n]))

  const resultsByUser = await getPlayerResultsByUser(env, users)

  const members = []
  for (const u of users) {
    const results = resultsByUser.get(u.id)
    if (!results) throw new Error(`No results computed for user ${u.id}`)
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
      position: u.position,
      classYear: classYear.get(u.id) ?? null,
      stripes: stripes.get(u.id) ?? {},
      sharedEvents: shared.get(u.id) ?? 0,
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
