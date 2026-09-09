import type { Env } from '../../../../_lib/env'
import { badRequest, json, notFound } from '../../../../_lib/http'
import type { AdminData } from '../../../_lib/types'
import { logAudit } from '../../../_lib/audit'
import { readScheduleConfig } from '../../../../_lib/schedule'
import { loadPayload } from '../matches'

interface BracketMatch {
  round: number
  slot: number
  team_a_id: number | null
  team_b_id: number | null
  winner_id?: number | null
}

// POST /api/admin/events/:id/matches/bracket -> seed the knockout stage from
// the finished pools. The client builds the bracket (same seeding lib as a
// standalone single-elim); the server checks the pools are complete and that
// every team in round 1 actually qualified, then appends the bracket matches
// alongside the pool matches.
export const onRequestPost: PagesFunction<Env, 'id', AdminData> = async ({ request, env, params, data }) => {
  const eventId = Number(params.id)
  if (!Number.isInteger(eventId)) return badRequest('Invalid id')

  const event = await env.DB.prepare(`SELECT play_format, format_config FROM events WHERE id = ?1`)
    .bind(eventId)
    .first<{ play_format: string | null; format_config: string | null }>()
  if (!event) return notFound('Event not found')
  if (event.play_format !== 'pool_bracket') return badRequest('This event isn’t a pool-play event')

  const payload = await loadPayload(env, eventId)
  if (!payload) return notFound('Event not found')
  if (payload.pools.length === 0) return badRequest('Generate the pools first')
  if (payload.pools.some((p) => !p.complete)) return badRequest('Every pool match needs a result before the bracket can start')
  if (payload.matches.some((m) => m.bracket !== 'pool')) return badRequest('The bracket has already started — regenerate the whole event to redo it')

  // Every team that was assigned a pool must actually be ranked in one of the
  // scored pools. A pool with only one team plays no round-robin, produces no
  // standings, and would silently vanish from the bracket otherwise.
  const rankedTeamIds = new Set(payload.pools.flatMap((p) => p.standings.map((r) => r.team_id)))
  const orphaned = payload.teams.filter((t) => t.pool != null && !rankedTeamIds.has(t.id))
  if (payload.teams.every((t) => t.pool == null) || orphaned.length > 0) {
    return badRequest('Some teams aren’t in a scored pool — fix the pool assignments and regenerate the pools')
  }

  const advance = readScheduleConfig(event.format_config).advance_per_pool
  const qualified = new Set<number>()
  for (const pool of payload.pools) {
    for (const row of pool.standings.slice(0, advance)) qualified.add(row.team_id)
  }

  const body = (await request.json().catch(() => null)) as { matches?: BracketMatch[] } | null
  const matches = body?.matches
  if (!Array.isArray(matches) || matches.length === 0) return badRequest('matches is required')

  const r1Teams = new Set<number>()
  for (const m of matches) {
    if (!Number.isInteger(m.round) || m.round < 1 || !Number.isInteger(m.slot) || m.slot < 0) {
      return badRequest('each bracket match needs a round and slot')
    }
    for (const t of [m.team_a_id, m.team_b_id]) {
      if (t == null) continue
      if (!qualified.has(t)) return badRequest('a bracket match includes a team that didn’t qualify')
      if (m.round === 1) r1Teams.add(t)
    }
    if (m.team_a_id != null && m.team_a_id === m.team_b_id) return badRequest('a match has the same team on both sides')
    if (m.winner_id != null) {
      const oneTeam = (m.team_a_id == null) !== (m.team_b_id == null)
      if (m.round !== 1 || !oneTeam || m.winner_id !== (m.team_a_id ?? m.team_b_id)) {
        return badRequest('a pre-set winner is only allowed for a first-round bye')
      }
    }
  }
  if (r1Teams.size !== qualified.size) return badRequest('the bracket must include every team that qualified, and only those')

  const statements = matches.map((m) =>
    env.DB.prepare(
      `INSERT INTO event_matches (event_id, bracket, pool, round, slot, court, team_a_id, team_b_id, winner_id)
       VALUES (?1, 'winners', NULL, ?2, ?3, NULL, ?4, ?5, ?6)`
    ).bind(eventId, m.round, m.slot, m.team_a_id ?? null, m.team_b_id ?? null, m.winner_id ?? null)
  )
  await env.DB.batch(statements)

  await logAudit(env, data.user.id, 'update', 'event_matches', eventId, { bracket_started: matches.length })

  const fresh = await loadPayload(env, eventId)
  return json(fresh)
}
