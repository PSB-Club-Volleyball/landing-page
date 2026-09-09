import type { Env } from '../../../_lib/env'
import { badRequest, json, notFound } from '../../../_lib/http'
import type { AdminData } from '../../_lib/types'
import { logAudit } from '../../_lib/audit'
import { computeStandings } from '../../../_lib/standings'
import { readScheduleConfig, slotStartTime, type ScheduleConfig } from '../../../_lib/schedule'
import { insertMatchStatement, validateBracketMatches, type WireMatch } from '../../../_lib/bracket'

interface MatchRow {
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
}

type Target = { bracket: string; round: number; slot: number; side: 0 | 1 } | null
function target(b: string | null, r: number | null, s: number | null, side: number | null): Target {
  return b != null && r != null && s != null && (side === 0 || side === 1) ? { bracket: b, round: r, slot: s, side } : null
}

// A double-elim event orders its rounds winners/losers round-by-round and then
// the grand final (and reset) last; single-elim and pool brackets just use the
// round number. Used only to spread match start times across total_minutes.
function bracketOrdinal(bracket: string, round: number, maxWinnersLosersRound: number): number {
  return bracket === 'final' ? maxWinnersLosersRound + round : round
}

export async function loadPayload(env: Env, eventId: number) {
  const event = await env.DB.prepare(`SELECT start_time, format_config FROM events WHERE id = ?1`)
    .bind(eventId)
    .first<{ start_time: string; format_config: string | null }>()
  if (!event) return null

  const teams = await env.DB.prepare(`SELECT id, name, pool, seed FROM event_teams WHERE event_id = ?1 ORDER BY seed, id`)
    .bind(eventId)
    .all<{ id: number; name: string; pool: string | null; seed: number }>()

  const matchRows = await env.DB.prepare(
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
    .bind(eventId)
    .all<MatchRow>()

  const rows = matchRows.results ?? []
  // Round robin / pool play ("pool") uses `slot` as a time-slot index. A
  // knockout bracket uses `slot` as the match's position in its round, so its
  // matches are timed by round instead.
  const isBracket = rows.some((r) => r.bracket !== 'pool')
  const slotCount = rows.reduce((max, r) => (r.bracket === 'pool' ? Math.max(max, r.slot + 1) : max), 0)
  const maxWLRound = rows.reduce(
    (max, r) => (r.bracket === 'winners' || r.bracket === 'losers' ? Math.max(max, r.round) : max),
    0
  )
  const bracketRounds = rows.reduce(
    (max, r) => (r.bracket !== 'pool' ? Math.max(max, bracketOrdinal(r.bracket, r.round, maxWLRound)) : max),
    0
  )
  const config = readScheduleConfig(event.format_config, isBracket ? undefined : slotCount)
  const matches = rows.map((r) => ({
    id: r.id,
    bracket: r.bracket,
    pool: r.pool,
    round: r.round,
    slot: r.slot,
    court: r.court,
    team_a_id: r.team_a_id,
    team_b_id: r.team_b_id,
    team_a_name: r.team_a_name,
    team_b_name: r.team_b_name,
    scores: r.scores ? (JSON.parse(r.scores) as [number, number][]) : null,
    forfeit_team_id: r.forfeit_team_id,
    winner_id: r.winner_id,
    winner_to: target(r.winner_to_bracket, r.winner_to_round, r.winner_to_slot, r.winner_to_side),
    loser_to: target(r.loser_to_bracket, r.loser_to_round, r.loser_to_slot, r.loser_to_side),
    start_time:
      r.bracket === 'pool'
        ? slotStartTime(event.start_time, r.slot, slotCount || 1, config.total_minutes)
        : slotStartTime(
            event.start_time,
            bracketOrdinal(r.bracket, r.round, maxWLRound) - 1,
            bracketRounds || 1,
            config.total_minutes
          ),
  }))

  const teamList = (teams.results ?? []).map((t) => ({ id: t.id, name: t.name, pool: t.pool, seed: t.seed }))
  const poolMatches = matches.filter((m) => m.bracket === 'pool')
  const hasPools = poolMatches.some((m) => m.pool != null)

  // Single round robin -> one flat table. Pool play -> one table per pool.
  let standings: ReturnType<typeof computeStandings> = []
  const pools: { label: string; standings: ReturnType<typeof computeStandings>; complete: boolean }[] = []
  if (poolMatches.length > 0 && !hasPools) {
    standings = computeStandings(teamList, poolMatches, config.sets_per_match)
  } else if (hasPools) {
    const labels = [...new Set(poolMatches.map((m) => m.pool).filter((p): p is string => p != null))].sort()
    for (const label of labels) {
      const pm = poolMatches.filter((m) => m.pool === label)
      const teamsInPool = teamList.filter((t) => t.pool === label)
      pools.push({
        label,
        standings: computeStandings(teamsInPool, pm, config.sets_per_match),
        complete: pm.every((m) => m.winner_id != null),
      })
    }
  }

  return { config, teams: teamList, matches, standings, pools }
}

// GET /api/admin/events/:id/matches
export const onRequestGet: PagesFunction<Env, 'id', AdminData> = async ({ env, params }) => {
  const eventId = Number(params.id)
  if (!Number.isInteger(eventId)) return badRequest('Invalid id')
  const payload = await loadPayload(env, eventId)
  if (!payload) return notFound('Event not found')
  return json(payload)
}

interface ScheduleInput {
  config: ScheduleConfig
  matches: WireMatch[]
}

function validateSchedule(body: unknown, teamIds: Set<number>): ScheduleInput | string {
  if (!body || typeof body !== 'object') return 'Invalid body'
  const b = body as Record<string, unknown>
  const c = b.config as Record<string, unknown> | undefined
  if (!c) return 'config is required'
  if (typeof c.courts !== 'number' || c.courts < 1) return 'courts must be at least 1'
  if (c.sets_per_match !== 1 && c.sets_per_match !== 3 && c.sets_per_match !== 5) return 'sets_per_match must be 1, 3, or 5'
  if (typeof c.total_minutes !== 'number' || c.total_minutes < 1) return 'total_minutes must be at least 1'
  if (c.bracket_stage != null && c.bracket_stage !== 'single' && c.bracket_stage !== 'double')
    return 'bracket_stage must be "single" or "double"'
  const err = validateBracketMatches(b.matches, teamIds)
  if (err) return err
  return body as ScheduleInput
}

// PUT /api/admin/events/:id/matches -> replace the whole schedule (structure
// only; entered scores are cleared). Merges the schedule knobs into
// format_config, keeping the rest (team_count).
export const onRequestPut: PagesFunction<Env, 'id', AdminData> = async ({ request, env, params, data }) => {
  const eventId = Number(params.id)
  if (!Number.isInteger(eventId)) return badRequest('Invalid id')

  const event = await env.DB.prepare(`SELECT format_config FROM events WHERE id = ?1`)
    .bind(eventId)
    .first<{ format_config: string | null }>()
  if (!event) return notFound('Event not found')

  const teams = await env.DB.prepare(`SELECT id FROM event_teams WHERE event_id = ?1`)
    .bind(eventId)
    .all<{ id: number }>()
  const teamIds = new Set((teams.results ?? []).map((t) => t.id))
  if (teamIds.size < 2) return badRequest('Add at least two teams before building a schedule')

  const parsed = validateSchedule(await request.json().catch(() => null), teamIds)
  if (typeof parsed === 'string') return badRequest(parsed)

  const existingConfig = event.format_config ? (JSON.parse(event.format_config) as Record<string, unknown>) : {}
  const mergedConfig = {
    ...existingConfig,
    slot_minutes: undefined, // drop the legacy per-slot field
    courts: Math.floor(parsed.config.courts),
    sets_per_match: parsed.config.sets_per_match,
    total_minutes: Math.floor(parsed.config.total_minutes),
    timed_only: Boolean(parsed.config.timed_only),
    double_round_robin: Boolean(parsed.config.double_round_robin),
    pools: Math.max(1, Math.floor(parsed.config.pools || 2)),
    advance_per_pool: Math.max(1, Math.floor(parsed.config.advance_per_pool || 2)),
    bracket_stage: parsed.config.bracket_stage === 'double' ? 'double' : 'single',
  }

  const statements = [
    env.DB.prepare(`UPDATE events SET format_config = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2`).bind(
      JSON.stringify(mergedConfig),
      eventId
    ),
    env.DB.prepare(`DELETE FROM event_matches WHERE event_id = ?1`).bind(eventId),
  ]
  for (const m of parsed.matches) {
    statements.push(insertMatchStatement(env, eventId, m))
  }
  await env.DB.batch(statements)

  await logAudit(env, data.user.id, 'update', 'event_matches', eventId, {
    match_count: parsed.matches.length,
    config: mergedConfig,
  })

  const payload = await loadPayload(env, eventId)
  return json(payload)
}

// PATCH /api/admin/events/:id/matches -> update only the schedule knobs
// (courts, sets per match, total time, timed-only, double round robin),
// leaving the match list and any entered scores untouched. Slot times in the
// response reflect the new total.
export const onRequestPatch: PagesFunction<Env, 'id', AdminData> = async ({ request, env, params, data }) => {
  const eventId = Number(params.id)
  if (!Number.isInteger(eventId)) return badRequest('Invalid id')

  const event = await env.DB.prepare(`SELECT format_config FROM events WHERE id = ?1`)
    .bind(eventId)
    .first<{ format_config: string | null }>()
  if (!event) return notFound('Event not found')

  const body = (await request.json().catch(() => null)) as { config?: Partial<ScheduleConfig> } | null
  const c = body?.config
  if (!c) return badRequest('config is required')
  if (c.courts != null && (typeof c.courts !== 'number' || c.courts < 1)) return badRequest('courts must be at least 1')
  if (c.sets_per_match != null && c.sets_per_match !== 1 && c.sets_per_match !== 3 && c.sets_per_match !== 5)
    return badRequest('sets_per_match must be 1, 3, or 5')
  if (c.total_minutes != null && (typeof c.total_minutes !== 'number' || c.total_minutes < 1))
    return badRequest('total_minutes must be at least 1')
  if (c.bracket_stage != null && c.bracket_stage !== 'single' && c.bracket_stage !== 'double')
    return badRequest('bracket_stage must be "single" or "double"')

  const existing = event.format_config ? (JSON.parse(event.format_config) as Record<string, unknown>) : {}
  const merged = {
    ...existing,
    slot_minutes: undefined,
    ...(c.courts != null ? { courts: Math.floor(c.courts) } : {}),
    ...(c.sets_per_match != null ? { sets_per_match: c.sets_per_match } : {}),
    ...(c.total_minutes != null ? { total_minutes: Math.floor(c.total_minutes) } : {}),
    ...(c.timed_only != null ? { timed_only: Boolean(c.timed_only) } : {}),
    ...(c.double_round_robin != null ? { double_round_robin: Boolean(c.double_round_robin) } : {}),
    ...(c.pools != null ? { pools: Math.max(1, Math.floor(c.pools)) } : {}),
    ...(c.advance_per_pool != null ? { advance_per_pool: Math.max(1, Math.floor(c.advance_per_pool)) } : {}),
    ...(c.bracket_stage != null ? { bracket_stage: c.bracket_stage === 'double' ? 'double' : 'single' } : {}),
  }
  await env.DB.prepare(`UPDATE events SET format_config = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2`)
    .bind(JSON.stringify(merged), eventId)
    .run()

  await logAudit(env, data.user.id, 'update', 'events', eventId, { schedule_config: merged })

  const payload = await loadPayload(env, eventId)
  return json(payload)
}
