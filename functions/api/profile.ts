import type { Env } from './_lib/env'
import { json, unauthorized } from './_lib/http'
import { getSessionUser } from './_lib/session'
import { eventCutoff } from './_lib/time'
import { readScheduleConfig } from './_lib/schedule'
import { computeStandings, type MatchLike } from './_lib/standings'

// GET /api/profile -> the signed-in user's own account page: club standing
// (position/team/skill level/dues/roster — meaningless for an outsider, so
// omitted entirely rather than sent as nulls) plus their RSVPs and personal
// match record, which any signed-in visitor can have regardless of role.
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const sessionUser = await getSessionUser(request, env)
  if (!sessionUser) return unauthorized()

  let club: unknown = null
  if (sessionUser.role !== 'outsider') {
    const row = await env.DB.prepare(
      `SELECT position, team, skill_level, dues_paid_year, dues_paid_at, waiver_signed_year
       FROM users WHERE id = ?1`
    )
      .bind(sessionUser.id)
      .first<{
        position: string | null
        team: string | null
        skill_level: string | null
        dues_paid_year: number | null
        dues_paid_at: string | null
        waiver_signed_year: number | null
      }>()

    const rosterRow = await env.DB.prepare(
      `SELECT season, jersey_number, class_year FROM roster WHERE user_id = ?1 ORDER BY season DESC LIMIT 1`
    )
      .bind(sessionUser.id)
      .first<{ season: string; jersey_number: number | null; class_year: string | null }>()

    club = {
      position: row?.position ?? null,
      team: row?.team ?? null,
      skillLevel: row?.skill_level ?? null,
      duesPaidYear: row?.dues_paid_year ?? null,
      duesPaidAt: row?.dues_paid_at ?? null,
      waiverSignedYear: row?.waiver_signed_year ?? null,
      roster: rosterRow
        ? { season: rosterRow.season, jerseyNumber: rosterRow.jersey_number, classYear: rosterRow.class_year }
        : null,
    }
  }

  const rsvpRows = await env.DB.prepare(
    `SELECT s.id AS signup_id, s.status, e.id AS event_id, e.title, e.start_time, e.location_name
     FROM event_signups s JOIN events e ON e.id = s.event_id
     WHERE LOWER(s.email) = ?1 AND s.status IN ('approved', 'pending')
       AND COALESCE(e.end_time, e.start_time) >= ?2
     ORDER BY e.start_time ASC`
  )
    .bind(sessionUser.email.toLowerCase(), eventCutoff(2))
    .all<{
      signup_id: number
      status: string
      event_id: number
      title: string
      start_time: string
      location_name: string | null
    }>()

  const upcomingRsvps = (rsvpRows.results ?? []).map((r) => ({
    signupId: r.signup_id,
    eventId: r.event_id,
    title: r.title,
    startTime: r.start_time,
    locationName: r.location_name,
    status: r.status,
  }))

  // Events this account played in: linked through event_team_members ->
  // event_signups by email, same identity key self-cancel uses (accounts
  // aren't linked to signups directly).
  const playedEventRows = await env.DB.prepare(
    `SELECT DISTINCT e.id AS event_id, e.title, e.start_time, e.format_config, et.id AS team_id
     FROM event_team_members etm
     JOIN event_signups es ON es.id = etm.signup_id
     JOIN event_teams et ON et.id = etm.team_id
     JOIN events e ON e.id = et.event_id
     WHERE LOWER(es.email) = ?1 AND et.published = 1`
  )
    .bind(sessionUser.email.toLowerCase())
    .all<{ event_id: number; title: string; start_time: string; format_config: string | null; team_id: number }>()

  const results: {
    eventId: number
    title: string
    startTime: string
    teamName: string
    wins: number
    losses: number
    setsWon: number
    setsLost: number
  }[] = []

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

  return json({
    profile: {
      account: {
        name: sessionUser.name,
        email: sessionUser.email,
        avatarUrl: sessionUser.avatarUrl,
        provider: sessionUser.provider,
        role: sessionUser.role,
      },
      club,
      upcomingRsvps,
      results,
    },
  })
}
