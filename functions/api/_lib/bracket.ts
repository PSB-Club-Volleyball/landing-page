// Server-side bracket helpers shared by the schedule PUT and the pool→bracket
// endpoint: shape validation for the wired match list, and the INSERT that
// carries the wiring columns.
import type { Env } from './env'

export interface WireTarget {
  bracket: string
  round: number
  slot: number
  side: 0 | 1
}

export interface WireMatch {
  bracket: string
  pool?: string | null
  round: number
  slot: number
  court?: string | null
  team_a_id: number | null
  team_b_id: number | null
  winner_id?: number | null
  winner_to?: WireTarget | null
  loser_to?: WireTarget | null
}

const BRACKETS = new Set(['pool', 'winners', 'losers', 'final'])

function validTarget(t: unknown, matchKeys: Set<string>): t is WireTarget | null {
  if (t == null) return true
  if (typeof t !== 'object') return false
  const o = t as Record<string, unknown>
  if (typeof o.bracket !== 'string' || !Number.isInteger(o.round) || !Number.isInteger(o.slot)) return false
  if (o.side !== 0 && o.side !== 1) return false
  return matchKeys.has(`${o.bracket}/${o.round}/${o.slot}`)
}

// Checks a bracket/pool match list from the client: legal bracket names, real
// team ids, wiring that lands on a match that exists, no target side fed twice,
// and pre-set winners only for a genuine first-round winners-bracket bye.
// Returns an error string, or null when the list is sound.
export function validateBracketMatches(matches: unknown, teamIds: Set<number>): string | null {
  if (!Array.isArray(matches)) return 'matches must be an array'
  const list = matches as Record<string, unknown>[]

  // Pass 1: every match is well-formed and its (bracket, round, slot) is unique.
  const keys = new Set<string>()
  for (const m of list) {
    if (typeof m.bracket !== 'string' || !BRACKETS.has(m.bracket)) return 'a match has an unknown bracket'
    if (!Number.isInteger(m.round) || (m.round as number) < 1) return 'each match needs a round of 1 or more'
    if (!Number.isInteger(m.slot) || (m.slot as number) < 0) return 'each match needs a slot of 0 or more'
    const k = `${m.bracket}/${m.round}/${m.slot}`
    if (keys.has(k)) return 'two matches share the same bracket slot'
    keys.add(k)
  }

  const fedSides = new Set<string>()
  for (const m of list) {
    for (const key of ['team_a_id', 'team_b_id'] as const) {
      const v = m[key]
      if (v !== null && (typeof v !== 'number' || !teamIds.has(v))) return 'a match references a team that is not on this event'
    }
    if (m.team_a_id != null && m.team_a_id === m.team_b_id) return 'a match has the same team on both sides'
    if (m.pool != null && (typeof m.pool !== 'string' || m.pool.length > 4)) return 'pool label must be a short string'

    for (const wire of ['winner_to', 'loser_to'] as const) {
      if (!validTarget(m[wire], keys)) return 'a match is wired to a slot that does not exist'
      const t = m[wire] as WireTarget | null
      if (t) {
        const fk = `${t.bracket}/${t.round}/${t.slot}/${t.side}`
        if (fedSides.has(fk)) return 'two matches feed the same bracket slot'
        fedSides.add(fk)
      }
    }

    // A pre-filled winner is only valid for a first-round winners-bracket bye —
    // one team, no opponent — so no fabricated results seed through the PUT.
    if (m.winner_id != null) {
      const oneTeam = (m.team_a_id == null) !== (m.team_b_id == null)
      const present = m.team_a_id ?? m.team_b_id
      if (m.bracket !== 'winners' || m.round !== 1 || !oneTeam || m.winner_id !== present) {
        return 'a pre-set winner is only allowed for a first-round bye'
      }
      if (m.winner_to != null || m.loser_to != null) return 'a bye match cannot be wired'
    }
  }

  // The wiring must be a DAG — advancement follows it, so a cycle would loop.
  const edges = new Map<string, string[]>()
  for (const m of list) {
    const from = `${m.bracket}/${m.round}/${m.slot}`
    const outs: string[] = []
    for (const wire of ['winner_to', 'loser_to'] as const) {
      const t = m[wire] as WireTarget | null
      if (t) outs.push(`${t.bracket}/${t.round}/${t.slot}`)
    }
    edges.set(from, outs)
  }
  const mark = new Map<string, 1 | 2>() // 1 = on stack, 2 = done
  const hasCycle = (node: string): boolean => {
    const state = mark.get(node)
    if (state === 1) return true
    if (state === 2) return false
    mark.set(node, 1)
    for (const next of edges.get(node) ?? []) if (hasCycle(next)) return true
    mark.set(node, 2)
    return false
  }
  for (const node of edges.keys()) if (hasCycle(node)) return 'the bracket wiring has a loop'

  return null
}

export function insertMatchStatement(env: Env, eventId: number, m: WireMatch) {
  return env.DB.prepare(
    `INSERT INTO event_matches
       (event_id, bracket, pool, round, slot, court, team_a_id, team_b_id, winner_id,
        winner_to_bracket, winner_to_round, winner_to_slot, winner_to_side,
        loser_to_bracket, loser_to_round, loser_to_slot, loser_to_side)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)`
  ).bind(
    eventId,
    m.bracket || 'pool',
    m.pool ?? null,
    m.round,
    m.slot,
    m.court ?? null,
    m.team_a_id ?? null,
    m.team_b_id ?? null,
    m.winner_id ?? null,
    m.winner_to?.bracket ?? null,
    m.winner_to?.round ?? null,
    m.winner_to?.slot ?? null,
    m.winner_to?.side ?? null,
    m.loser_to?.bracket ?? null,
    m.loser_to?.round ?? null,
    m.loser_to?.slot ?? null,
    m.loser_to?.side ?? null
  )
}
