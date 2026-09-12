import type { Env } from './env'
import { readScheduleConfig } from './schedule'
import { computeStandings, type MatchLike } from './standings'

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

// Cross-event W/L/sets for one account, linked through email the same way
// self-cancel and /api/profile already do (accounts aren't linked to
// signups directly). Newest event first.
export async function getPlayerResults(env: Env, email: string): Promise<PlayerResult[]> {
  const playedEventRows = await env.DB.prepare(
    `SELECT DISTINCT e.id AS event_id, e.title, e.start_time, e.format_config, et.id AS team_id
     FROM event_team_members etm
     JOIN event_signups es ON es.id = etm.signup_id
     JOIN event_teams et ON et.id = etm.team_id
     JOIN events e ON e.id = et.event_id
     WHERE LOWER(es.email) = ?1 AND et.published = 1`
  )
    .bind(email.toLowerCase())
    .all<{ event_id: number; title: string; start_time: string; format_config: string | null; team_id: number }>()

  const results: PlayerResult[] = []

  for (const ev of playedEventRows.results ?? []) {
    const teamRows = await env.DB.prepare(
      `SELECT id, name FROM event_teams WHERE event_id = ?1 AND published = 1`
    )
      .bind(ev.event_id)
      .all<{ id: number; name: string }>()
    const teams = teamRows.results ?? []
    const myTeam = teams.find((t) => t.id === ev.team_id)
    if (!myTeam) continue

    const matchRows = await env.DB.prepare(
      `SELECT team_a_id, team_b_id, scores, forfeit_team_id FROM event_matches WHERE event_id = ?1`
    )
      .bind(ev.event_id)
      .all<{ team_a_id: number | null; team_b_id: number | null; scores: string | null; forfeit_team_id: number | null }>()
    const matches: MatchLike[] = (matchRows.results ?? []).map((m) => ({
      ...m,
      scores: m.scores ? (JSON.parse(m.scores) as [number, number][]) : null,
    }))
    if (matches.length === 0) continue

    const setsPerMatch = readScheduleConfig(ev.format_config).sets_per_match
    const standings = computeStandings(teams, matches, setsPerMatch)
    const myRow = standings.find((r) => r.team_id === myTeam.id)
    if (!myRow || myRow.played === 0) continue

    results.push({
      eventId: ev.event_id,
      title: ev.title,
      startTime: ev.start_time,
      teamName: myTeam.name,
      wins: myRow.wins,
      losses: myRow.losses,
      setsWon: myRow.sets_won,
      setsLost: myRow.sets_lost,
    })
  }
  results.sort((a, b) => b.startTime.localeCompare(a.startTime))
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
