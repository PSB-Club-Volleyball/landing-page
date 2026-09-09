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

interface BracketRow {
  id: number
  bracket: string
  round: number
  slot: number
  team_a_id: number | null
  team_b_id: number | null
  winner_to_bracket: string | null
  winner_to_round: number | null
  winner_to_slot: number | null
  winner_to_side: number | null
  loser_to_bracket: string | null
  loser_to_round: number | null
  loser_to_slot: number | null
  loser_to_side: number | null
}

const keyOf = (bracket: string, round: number, slot: number) => `${bracket}/${round}/${slot}`

// PATCH /api/admin/events/:id/matches/:matchId -> record a result. winner_id
// is recomputed from the scores (or the forfeit), then — for a knockout match
// — the winner and loser are pushed down their wiring and every now-stale
// result below is cleared.
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
  const loserId =
    winnerId == null ? null : winnerId === match.team_a_id ? match.team_b_id : match.team_a_id

  const writes = [
    env.DB.prepare(`UPDATE event_matches SET scores = ?1, forfeit_team_id = ?2, winner_id = ?3 WHERE id = ?4`).bind(
      parsed.scores && parsed.scores.length > 0 ? JSON.stringify(parsed.scores) : null,
      parsed.forfeit_team_id,
      winnerId,
      matchId
    ),
  ]

  if (match.bracket === 'winners' || match.bracket === 'losers' || match.bracket === 'final') {
    const rows = await env.DB.prepare(
      `SELECT id, bracket, round, slot, team_a_id, team_b_id,
              winner_to_bracket, winner_to_round, winner_to_slot, winner_to_side,
              loser_to_bracket, loser_to_round, loser_to_slot, loser_to_side
       FROM event_matches
       WHERE event_id = ?1 AND bracket IN ('winners', 'losers', 'final')`
    )
      .bind(eventId)
      .all<BracketRow>()
    const byKey = new Map((rows.results ?? []).map((r) => [keyOf(r.bracket, r.round, r.slot), r]))
    // matchId -> the side writes accumulated for it (its result is always cleared)
    const touched = new Map<number, { a?: number | null; b?: number | null }>()
    // Matches whose downstream we've already walked this request. Bounds the
    // walk to O(bracket size) and makes it safe against a wiring cycle.
    const walked = new Set<number>()

    const wireOf = (r: BracketRow, which: 'winner' | 'loser') => {
      const b = which === 'winner' ? r.winner_to_bracket : r.loser_to_bracket
      const rd = which === 'winner' ? r.winner_to_round : r.loser_to_round
      const sl = which === 'winner' ? r.winner_to_slot : r.loser_to_slot
      const sd = which === 'winner' ? r.winner_to_side : r.loser_to_side
      return b != null && rd != null && sl != null && (sd === 0 || sd === 1)
        ? { key: keyOf(b, rd, sl), side: sd as 0 | 1 }
        : null
    }

    // Push `teamId` (possibly null) into a target slot, clear that match's
    // result, and keep clearing everything it in turn feeds.
    const feed = (wire: { key: string; side: 0 | 1 } | null, teamId: number | null) => {
      if (!wire) return
      const child = byKey.get(wire.key)
      if (!child || child.id === matchId) return
      const entry = touched.get(child.id) ?? {}
      if (wire.side === 0) entry.a = teamId
      else entry.b = teamId
      touched.set(child.id, entry)
      if (walked.has(child.id)) return
      walked.add(child.id)
      // The grand final carries no wiring (its routing is special-cased), so
      // clearing it has to explicitly take the reset game with it.
      if (child.bracket === 'final' && child.round === 1) {
        const reset = byKey.get(keyOf('final', 2, 0))
        if (reset && reset.id !== matchId) touched.set(reset.id, { a: null, b: null })
      }
      feed(wireOf(child, 'winner'), null)
      feed(wireOf(child, 'loser'), null)
    }

    if (match.bracket === 'final' && match.round === 1) {
      // The reset game only happens if the losers-bracket team takes game 1.
      // idealDoubleElim() in src/lib/bracket.ts always wires the losers-bracket
      // finalist into the grand final's team_b (side 1) and the winners-bracket
      // finalist into team_a, and collapse() preserves the side — so team_b is
      // the losers-bracket rep here. Otherwise the reset stays empty and the
      // winners-bracket team is champion.
      const reset = byKey.get(keyOf('final', 2, 0))
      if (reset) {
        const lbWon = winnerId != null && winnerId === match.team_b_id
        touched.set(reset.id, {
          a: lbWon ? match.team_a_id : null,
          b: lbWon ? match.team_b_id : null,
        })
        feed(wireOf(reset, 'winner'), null)
        feed(wireOf(reset, 'loser'), null)
      }
    } else {
      const self = byKey.get(keyOf(match.bracket, match.round, match.slot))
      if (self) {
        feed(wireOf(self, 'winner'), winnerId)
        feed(wireOf(self, 'loser'), loserId)
      }
    }

    for (const [id, entry] of touched) {
      const sets: string[] = []
      const binds: unknown[] = []
      if ('a' in entry) {
        binds.push(entry.a ?? null)
        sets.push(`team_a_id = ?${binds.length}`)
      }
      if ('b' in entry) {
        binds.push(entry.b ?? null)
        sets.push(`team_b_id = ?${binds.length}`)
      }
      sets.push('scores = NULL', 'forfeit_team_id = NULL', 'winner_id = NULL')
      binds.push(id)
      writes.push(env.DB.prepare(`UPDATE event_matches SET ${sets.join(', ')} WHERE id = ?${binds.length}`).bind(...binds))
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
