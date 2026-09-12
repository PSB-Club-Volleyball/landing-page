import type { Env } from '../_lib/env'
import { badRequest, json, notFound } from '../_lib/http'
import { getSessionUser } from '../_lib/session'
import { computeStandings } from '../_lib/standings'
import { readScheduleConfig, slotStartTime } from '../_lib/schedule'

// GET /api/events/:id -> a single published or cancelled event, for its own
// public page at /events/:eventId. Drafts stay admin-only (404 here). Unlike
// the list at /api/events, this doesn't hide past events or unreleased series
// occurrences — someone with the direct link can always open the page; the
// list is the only place that "releases" weekly occurrences a week at a time.
// If the visitor is signed in, the event carries their own signup (if any) so
// the page can offer "manage" instead of "sign up" without a second request.
export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const id = Number(params.id)
  if (!Number.isInteger(id)) return badRequest('Invalid id')

  const event = await env.DB.prepare(
    `SELECT e.id, e.title, e.description, e.event_type, e.start_time, e.end_time,
            e.location_name, e.location_address, e.status,
            e.signup_enabled, e.rsvp_gated, e.form_id, e.capacity, e.tags, e.signup_deadline, e.allowed_skill_levels,
            e.play_format, e.format_config,
            (SELECT COUNT(*) FROM event_signups s WHERE s.event_id = e.id AND s.status = 'approved') AS signup_count
     FROM events e
     WHERE e.id = ?1 AND e.status IN ('published', 'cancelled')`
  )
    .bind(id)
    .first<
      | (Record<string, unknown> & {
          signup_enabled: number
          rsvp_gated: number
          id: number
          start_time: string
          play_format: string | null
          format_config: string | null
        })
      | null
    >()

  if (!event) return notFound('Event not found')

  const sessionUser = await getSessionUser(request, env)
  let mySignup: { id: number; status: string } | null = null
  if (sessionUser) {
    mySignup = await env.DB.prepare(
      `SELECT id, status FROM event_signups WHERE event_id = ?1 AND LOWER(email) = ?2`
    )
      .bind(id, sessionUser.email.toLowerCase())
      .first<{ id: number; status: string }>()
  }

  // Published teams only. Members are name + captain flag — no contact info
  // leaves the admin side.
  const teamRows = await env.DB.prepare(
    `SELECT id, name, seed, pool FROM event_teams WHERE event_id = ?1 AND published = 1 ORDER BY seed, id`
  )
    .bind(id)
    .all<{ id: number; name: string; seed: number; pool: string | null }>()

  const teamList = teamRows.results ?? []
  let teams: {
    id: number
    name: string
    seed: number
    pool: string | null
    members: { name: string; is_captain: boolean }[]
  }[] = []
  if (teamList.length > 0) {
    const ids = teamList.map((t) => t.id)
    const placeholders = ids.map((_, i) => `?${i + 1}`).join(', ')
    const memberRes = await env.DB.prepare(
      `SELECT m.team_id, m.is_captain, COALESCE(m.display_name, s.name) AS name
       FROM event_team_members m
       LEFT JOIN event_signups s ON s.id = m.signup_id
       WHERE m.team_id IN (${placeholders})
       ORDER BY m.id`
    )
      .bind(...ids)
      .all<{ team_id: number; is_captain: number; name: string | null }>()
    const memberList = memberRes.results ?? []
    teams = teamList.map((t) => ({
      id: t.id,
      name: t.name,
      seed: t.seed,
      pool: t.pool,
      members: memberList
        .filter((m) => m.team_id === t.id)
        .map((m) => ({ name: m.name ?? 'Unknown', is_captain: Boolean(m.is_captain) })),
    }))
  }

  // Schedule + standings ride along whenever teams are published.
  let scheduleConfig = readScheduleConfig(event.format_config)
  let matches: unknown[] = []
  let standings: unknown[] = []
  let pools: { label: string; standings: unknown[]; complete: boolean }[] = []
  if (teamList.length > 0) {
    const matchRes = await env.DB.prepare(
      `SELECT m.id, m.bracket, m.pool, m.round, m.slot, m.court, m.team_a_id, m.team_b_id,
              ta.name AS team_a_name, tb.name AS team_b_name,
              m.scores, m.forfeit_team_id, m.winner_id,
              m.winner_to_bracket, m.winner_to_round, m.winner_to_slot, m.winner_to_side,
              m.loser_to_bracket, m.loser_to_round, m.loser_to_slot, m.loser_to_side
       FROM event_matches m
       LEFT JOIN event_teams ta ON ta.id = m.team_a_id
       LEFT JOIN event_teams tb ON tb.id = m.team_b_id
       WHERE m.event_id = ?1
       ORDER BY m.round, m.slot, m.court`
    )
      .bind(id)
      .all<{
        id: number
        bracket: string
        pool: string | null
        round: number
        slot: number
        court: string | null
        team_a_id: number | null
        team_b_id: number | null
        team_a_name: string | null
        team_b_name: string | null
        scores: string | null
        forfeit_team_id: number | null
        winner_id: number | null
        winner_to_bracket: string | null
        winner_to_round: number | null
        winner_to_slot: number | null
        winner_to_side: number | null
        loser_to_bracket: string | null
        loser_to_round: number | null
        loser_to_slot: number | null
        loser_to_side: number | null
      }>()
    const wireTarget = (b: string | null, rd: number | null, sl: number | null, sd: number | null) =>
      b != null && rd != null && sl != null && (sd === 0 || sd === 1) ? { bracket: b, round: rd, slot: sl, side: sd } : null
    const parsedMatches = (matchRes.results ?? []).map((r) => ({
      ...r,
      scores: r.scores ? (JSON.parse(r.scores) as [number, number][]) : null,
      winner_to: wireTarget(r.winner_to_bracket, r.winner_to_round, r.winner_to_slot, r.winner_to_side),
      loser_to: wireTarget(r.loser_to_bracket, r.loser_to_round, r.loser_to_slot, r.loser_to_side),
    }))
    // Pool matches are timed by slot; bracket matches by round, with the grand
    // final and reset last.
    const isBracket = parsedMatches.some((r) => r.bracket !== 'pool')
    const slotCount = parsedMatches.reduce((max, r) => (r.bracket === 'pool' ? Math.max(max, r.slot + 1) : max), 0)
    const maxWLRound = parsedMatches.reduce(
      (max, r) => (r.bracket === 'winners' || r.bracket === 'losers' ? Math.max(max, r.round) : max),
      0
    )
    const ordinal = (r: { bracket: string; round: number }) =>
      r.bracket === 'final' ? maxWLRound + r.round : r.round
    const bracketRounds = parsedMatches.reduce((max, r) => (r.bracket !== 'pool' ? Math.max(max, ordinal(r)) : max), 0)
    scheduleConfig = readScheduleConfig(event.format_config, isBracket ? undefined : slotCount)
    matches = parsedMatches.map((r) => ({
      ...r,
      start_time:
        r.bracket === 'pool'
          ? slotStartTime(event.start_time, r.slot, slotCount || 1, scheduleConfig.total_minutes)
          : slotStartTime(event.start_time, ordinal(r) - 1, bracketRounds || 1, scheduleConfig.total_minutes),
    }))
    if (!scheduleConfig.timed_only) {
      const poolMatches = parsedMatches.filter((r) => r.bracket === 'pool')
      const hasPools = poolMatches.some((r) => r.pool != null)
      if (poolMatches.length > 0 && !hasPools) {
        const rows = computeStandings(
          teamList.map((t) => ({ id: t.id, name: t.name })),
          poolMatches,
          scheduleConfig.sets_per_match
        )
        if (rows.some((r) => r.played > 0)) standings = rows
      } else if (hasPools) {
        const labels = [...new Set(poolMatches.map((r) => r.pool).filter((p): p is string => p != null))].sort()
        pools = labels.map((label) => {
          const pm = poolMatches.filter((r) => r.pool === label)
          return {
            label,
            standings: computeStandings(
              teamList.filter((t) => t.pool === label).map((t) => ({ id: t.id, name: t.name })),
              pm,
              scheduleConfig.sets_per_match
            ),
            complete: pm.every((r) => r.winner_id != null),
          }
        })
      }
    }
  }

  return json({
    event: {
      ...event,
      format_config: undefined,
      signup_enabled: Boolean(event.signup_enabled),
      rsvp_gated: Boolean(event.rsvp_gated),
      my_signup_id: mySignup?.id ?? null,
      my_signup_status: mySignup?.status ?? null,
      teams,
      schedule_config: scheduleConfig,
      matches,
      standings,
      pools,
    },
  })
}
