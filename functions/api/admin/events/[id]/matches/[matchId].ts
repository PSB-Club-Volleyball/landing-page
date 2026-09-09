import type { Env } from '../../../../_lib/env'
import { badRequest, json, notFound } from '../../../../_lib/http'
import type { AdminData } from '../../../_lib/types'
import { logAudit } from '../../../_lib/audit'
import { matchWinnerId } from '../../../../_lib/standings'
import { readScheduleConfig } from '../../../../_lib/schedule'

interface Body {
  scores: [number, number][] | null
  forfeit_team_id: number | null
}

function validate(body: unknown): Body | string {
  if (!body || typeof body !== 'object') return 'Invalid body'
  const b = body as Record<string, unknown>
  if (b.scores !== null) {
    if (!Array.isArray(b.scores)) return 'scores must be an array or null'
    for (const set of b.scores) {
      if (
        !Array.isArray(set) ||
        set.length !== 2 ||
        !Number.isInteger(set[0]) ||
        !Number.isInteger(set[1]) ||
        set[0] < 0 ||
        set[1] < 0
      ) {
        return 'each set must be a pair of non-negative integers'
      }
      if (set[0] === set[1]) return 'a set can’t end level — one side has to win it'
    }
  }
  if (b.forfeit_team_id !== null && !Number.isInteger(b.forfeit_team_id)) return 'forfeit_team_id must be a team id or null'
  return b as unknown as Body
}

// PATCH /api/admin/events/:id/matches/:matchId -> record a result. winner_id
// is recomputed from the scores (or the forfeit).
export const onRequestPatch: PagesFunction<Env, 'id' | 'matchId', AdminData> = async ({ request, env, params, data }) => {
  const eventId = Number(params.id)
  const matchId = Number(params.matchId)
  if (!Number.isInteger(eventId) || !Number.isInteger(matchId)) return badRequest('Invalid id')

  const match = await env.DB.prepare(
    `SELECT m.id, m.bracket, m.round, m.slot, m.team_a_id, m.team_b_id, e.format_config
     FROM event_matches m JOIN events e ON e.id = m.event_id
     WHERE m.id = ?1 AND m.event_id = ?2`
  )
    .bind(matchId, eventId)
    .first<{
      id: number
      bracket: string
      round: number
      slot: number
      team_a_id: number | null
      team_b_id: number | null
      format_config: string | null
    }>()
  if (!match) return notFound('Match not found')
  const setsPerMatch = readScheduleConfig(match.format_config).sets_per_match

  const parsed = validate(await request.json().catch(() => null))
  if (typeof parsed === 'string') return badRequest(parsed)

  if (
    parsed.forfeit_team_id !== null &&
    parsed.forfeit_team_id !== match.team_a_id &&
    parsed.forfeit_team_id !== match.team_b_id
  ) {
    return badRequest('forfeit_team_id must be one of the two teams in this match')
  }

  const winnerId = matchWinnerId(
    {
      team_a_id: match.team_a_id,
      team_b_id: match.team_b_id,
      scores: parsed.scores,
      forfeit_team_id: parsed.forfeit_team_id,
    },
    setsPerMatch
  )

  const writes = [
    env.DB.prepare(`UPDATE event_matches SET scores = ?1, forfeit_team_id = ?2, winner_id = ?3 WHERE id = ?4`).bind(
      parsed.scores && parsed.scores.length > 0 ? JSON.stringify(parsed.scores) : null,
      parsed.forfeit_team_id,
      winnerId,
      matchId
    ),
  ]

  // Knockout bracket: carry the result down the tree. The match in round r
  // slot s feeds round r+1 slot floor(s/2), into team_a when s is even and
  // team_b when odd. The winner is stamped into the child; because that makes
  // the child's own (now stale) result invalid, its scores are blanked and
  // the same clearing cascades to every round below it.
  if (match.bracket === 'winners') {
    const maxRound = await env.DB.prepare(
      `SELECT MAX(round) AS r FROM event_matches WHERE event_id = ?1 AND bracket = 'winners'`
    )
      .bind(eventId)
      .first<{ r: number | null }>()
    let r = match.round
    let s = match.slot
    let value: number | null = winnerId
    while (maxRound?.r != null && r + 1 <= maxRound.r) {
      const childRound = r + 1
      const childSlot = Math.floor(s / 2)
      const col = s % 2 === 0 ? 'team_a_id' : 'team_b_id'
      writes.push(
        env.DB.prepare(
          `UPDATE event_matches SET ${col} = ?1, scores = NULL, forfeit_team_id = NULL, winner_id = NULL
           WHERE event_id = ?2 AND bracket = 'winners' AND round = ?3 AND slot = ?4`
        ).bind(value, eventId, childRound, childSlot)
      )
      // Deeper rounds only need their fed slot cleared — no team is decided yet.
      r = childRound
      s = childSlot
      value = null
    }
  }

  await env.DB.batch(writes)

  await logAudit(env, data.user.id, 'update', 'event_matches', matchId, {
    scores: parsed.scores,
    forfeit_team_id: parsed.forfeit_team_id,
    winner_id: winnerId,
  })
  return json({ ok: true, winner_id: winnerId })
}
