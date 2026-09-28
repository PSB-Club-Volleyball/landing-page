import type { Env } from './env'
import { readScheduleConfig } from './schedule'
import { computeStandings, type MatchLike, type StandingRow } from './standings'

export interface PlayerResult {
  eventId: number
  title: string
  startTime: string
  teamName: string
  wins: number
  losses: number
  setsWon: number
  setsLost: number
}

export interface PlayerSummary {
  wins: number
  losses: number
  setsWon: number
  setsLost: number
  winPct: number
  // Count of consecutive most-recent events (by startTime) this account had
  // more wins than losses in. 0 if the most recent event wasn't a win.
  currentStreak: number
}

// Cross-event W/L/sets per account. A team member counts as an account when
// it's linked to it (event_team_members.user_id, see migration 0031), or — if
// unlinked — when its signup email is the account's email and the account
// isn't linked elsewhere in that event, so someone who makes an account after
// playing still gets credit. Newest event first.
//
// Loads every published team, its event, and its matches in one D1 batch and
// computes each event's standings once, so the cost is one round trip no
// matter how many accounts are asked for (GET /api/members asks for all).
export async function getPlayerResultsByUser(
  env: Env,
  users: { id: number; email: string }[]
): Promise<Map<number, PlayerResult[]>> {
  const [memberRows, teamRows, matchRows, eventRows] = await env.DB.batch([
    // Every team, published or not: a link on an unpublished team still
    // blocks email attribution for that event.
    env.DB.prepare(
      `SELECT etm.user_id, LOWER(es.email) AS email, et.id AS team_id, et.event_id, et.published
       FROM event_team_members etm
       JOIN event_teams et ON et.id = etm.team_id
       LEFT JOIN event_signups es ON es.id = etm.signup_id`
    ),
    env.DB.prepare(`SELECT id, name, event_id FROM event_teams WHERE published = 1`),
    env.DB.prepare(
      `SELECT id, event_id, team_a_id, team_b_id, scores, forfeit_team_id FROM event_matches
       WHERE event_id IN (SELECT event_id FROM event_teams WHERE published = 1)`
    ),
    env.DB.prepare(
      `SELECT id, title, start_time, format_config FROM events
       WHERE id IN (SELECT event_id FROM event_teams WHERE published = 1)`
    ),
  ])
  const members = memberRows.results as {
    user_id: number | null
    email: string | null
    team_id: number
    event_id: number
    published: number
  }[]

  const teamsByEvent = new Map<number, { id: number; name: string }[]>()
  for (const t of teamRows.results as { id: number; name: string; event_id: number }[]) {
    const list = teamsByEvent.get(t.event_id) ?? []
    list.push({ id: t.id, name: t.name })
    teamsByEvent.set(t.event_id, list)
  }
  const matchesByEvent = new Map<number, MatchLike[]>()
  for (const m of matchRows.results as {
    id: number
    event_id: number
    team_a_id: number | null
    team_b_id: number | null
    scores: string | null
    forfeit_team_id: number | null
  }[]) {
    const list = matchesByEvent.get(m.event_id) ?? []
    list.push({
      team_a_id: m.team_a_id,
      team_b_id: m.team_b_id,
      scores: m.scores ? parseScores(m.scores, m.id, m.event_id) : null,
      forfeit_team_id: m.forfeit_team_id,
    })
    matchesByEvent.set(m.event_id, list)
  }
  const events = new Map(
    (eventRows.results as { id: number; title: string; start_time: string; format_config: string | null }[]).map(
      (e) => [e.id, e]
    )
  )

  const standingsCache = new Map<number, StandingRow[]>()
  const standingsFor = (eventId: number, formatConfig: string | null): StandingRow[] => {
    let standings = standingsCache.get(eventId)
    if (!standings) {
      const setsPerMatch = readScheduleConfig(formatConfig).sets_per_match
      standings = computeStandings(teamsByEvent.get(eventId) ?? [], matchesByEvent.get(eventId) ?? [], setsPerMatch)
      standingsCache.set(eventId, standings)
    }
    return standings
  }

  const linkedEvents = new Map<number, Set<number>>()
  for (const m of members) {
    if (m.user_id == null) continue
    const set = linkedEvents.get(m.user_id) ?? new Set<number>()
    set.add(m.event_id)
    linkedEvents.set(m.user_id, set)
  }
  const usersByEmail = new Map<string, number[]>()
  for (const u of users) {
    const email = u.email.toLowerCase()
    usersByEmail.set(email, [...(usersByEmail.get(email) ?? []), u.id])
  }

  // Distinct (event, team) pairs each account played on.
  const played = new Map<number, Map<string, { eventId: number; teamId: number }>>(users.map((u) => [u.id, new Map()]))
  for (const m of members) {
    if (m.published !== 1) continue
    const owners =
      m.user_id != null
        ? [m.user_id]
        : m.email
          ? (usersByEmail.get(m.email) ?? []).filter((id) => !linkedEvents.get(id)?.has(m.event_id))
          : []
    for (const id of owners) played.get(id)?.set(`${m.event_id}:${m.team_id}`, { eventId: m.event_id, teamId: m.team_id })
  }

  const byUser = new Map<number, PlayerResult[]>()
  for (const [userId, pairs] of played) {
    const results: PlayerResult[] = []
    for (const { eventId, teamId } of pairs.values()) {
      const ev = events.get(eventId)
      if (!ev) throw new Error(`Published team ${teamId} references missing event ${eventId}`)
      if ((matchesByEvent.get(eventId) ?? []).length === 0) continue
      const myRow = standingsFor(eventId, ev.format_config).find((r) => r.team_id === teamId)
      if (!myRow || myRow.played === 0) continue
      results.push({
        eventId,
        title: ev.title,
        startTime: ev.start_time,
        teamName: myRow.name,
        wins: myRow.wins,
        losses: myRow.losses,
        setsWon: myRow.sets_won,
        setsLost: myRow.sets_lost,
      })
    }
    results.sort((a, b) => b.startTime.localeCompare(a.startTime))
    byUser.set(userId, results)
  }
  return byUser
}

// Every published event's matches feed every caller here, so a corrupt row
// would fail all of them — name it so it can be found.
function parseScores(raw: string, matchId: number, eventId: number): [number, number][] {
  try {
    return JSON.parse(raw) as [number, number][]
  } catch (e) {
    throw new Error(`event_matches ${matchId} (event ${eventId}) has malformed scores: ${raw}`, { cause: e })
  }
}

export async function getPlayerResults(env: Env, user: { id: number; email: string }): Promise<PlayerResult[]> {
  const results = (await getPlayerResultsByUser(env, [user])).get(user.id)
  if (!results) throw new Error(`No results computed for user ${user.id}`)
  return results
}

export function getPlayerSummary(results: PlayerResult[]): PlayerSummary {
  const totals = results.reduce(
    (acc, r) => ({
      wins: acc.wins + r.wins,
      losses: acc.losses + r.losses,
      setsWon: acc.setsWon + r.setsWon,
      setsLost: acc.setsLost + r.setsLost,
    }),
    { wins: 0, losses: 0, setsWon: 0, setsLost: 0 }
  )
  const played = totals.wins + totals.losses

  let currentStreak = 0
  for (const r of results) {
    if (r.wins > r.losses) currentStreak++
    else break
  }

  return {
    ...totals,
    winPct: played === 0 ? 0 : totals.wins / played,
    currentStreak,
  }
}
