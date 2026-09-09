import type { Env } from '../../../../_lib/env'
import { badRequest, json, notFound } from '../../../../_lib/http'
import type { AdminData } from '../../../_lib/types'
import { logAudit } from '../../../_lib/audit'
import { readScheduleConfig } from '../../../../_lib/schedule'
import { insertMatchStatement, validateBracketMatches, type WireMatch } from '../../../../_lib/bracket'
import { loadPayload } from '../matches'

// POST /api/admin/events/:id/matches/bracket -> seed the knockout stage from
// the finished pools. The client builds the bracket (single- or double-elim,
// per format_config.bracket_stage); the server checks the pools are complete
// and that every round-1 team actually qualified, then appends the bracket
// matches alongside the pool matches.
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

  const body = (await request.json().catch(() => null)) as { matches?: unknown } | null
  const err = validateBracketMatches(body?.matches, new Set(payload.teams.map((t) => t.id)))
  if (err) return badRequest(err)
  const matches = body!.matches as WireMatch[]
  if (matches.length === 0) return badRequest('matches is required')

  // This endpoint only appends the knockout stage — it must not touch the pool
  // matches, and only the winners-bracket round 1 carries teams on generate.
  const r1Teams = new Set<number>()
  for (const m of matches) {
    if (m.bracket === 'pool') return badRequest('the bracket payload can’t include pool matches')
    const seeded = m.bracket === 'winners' && m.round === 1
    for (const t of [m.team_a_id, m.team_b_id]) {
      if (t == null) continue
      if (!seeded) return badRequest('only the first round of the bracket can be pre-filled')
      if (!qualified.has(t)) return badRequest('a bracket match includes a team that didn’t qualify')
      r1Teams.add(t)
    }
  }
  if (r1Teams.size !== qualified.size) return badRequest('the bracket must include every team that qualified, and only those')

  const statements = matches.map((m) => insertMatchStatement(env, eventId, { ...m, pool: null }))
  await env.DB.batch(statements)

  await logAudit(env, data.user.id, 'update', 'event_matches', eventId, { bracket_started: matches.length })

  const fresh = await loadPayload(env, eventId)
  return json(fresh)
}
