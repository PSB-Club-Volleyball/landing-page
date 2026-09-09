import type { BracketTarget, ScheduleInput } from '../types'

type BuiltMatch = ScheduleInput['matches'][number]

// Standard single-elimination seeding order for a bracket of `size` (a power
// of two): position k (0-indexed) holds this seed number. Built recursively so
// seed 1 meets seed `size` first, the two halves can't meet before the final,
// and byes (seeds past the real team count) sit opposite the top seeds.
export function standardSeedOrder(size: number): number[] {
  let order = [1]
  while (order.length < size) {
    const next: number[] = []
    const roundSize = order.length * 2 + 1
    for (const seed of order) {
      next.push(seed, roundSize - seed)
    }
    order = next
  }
  return order
}

function nextPowerOfTwo(n: number): number {
  let p = 1
  while (p < n) p *= 2
  return p
}

// Build a single-elimination bracket from teams already in seed order
// (`event_teams.seed`). Returns matches ready for the schedule PUT: one per
// bracket slot, with `winner_id` pre-filled where a team had a bye and the
// bye winner carried forward into the next round. Round 1 is the widest;
// `round` counts up to the final. Bracket matches aren't assigned a court —
// the tree is timed by round, not by a court/slot grid.
export function buildSingleElimBracket(seededTeamIds: number[]): BuiltMatch[] {
  const n = seededTeamIds.length
  if (n < 2) return []
  const size = nextPowerOfTwo(n)
  const rounds = Math.log2(size)
  const order = standardSeedOrder(size)

  const teamAt = (pos: number): number | null => {
    const seed = order[pos]
    return seed <= n ? seededTeamIds[seed - 1] : null
  }

  // slotTeams[round][slot] = [teamA|null, teamB|null]
  const slotTeams: (number | null)[][][] = []
  for (let r = 1; r <= rounds; r++) {
    const count = size / 2 ** r
    slotTeams[r] = Array.from({ length: count }, () => [null, null] as [number | null, number | null])
  }
  for (let s = 0; s < size / 2; s++) {
    slotTeams[1][s] = [teamAt(2 * s), teamAt(2 * s + 1)]
  }

  // `slot` here is the match's position within its round (0..count-1), which
  // wires the tree: round r slot s feeds round r+1 slot floor(s/2). Because
  // `size` is the next power of two above `n`, a team can get at most one bye,
  // and only in round 1 — a round-1 slot with a single real team. A slot in a
  // later round that has only one team just hasn't had its other side decided
  // yet (TBD), it is not a bye.
  const out: BuiltMatch[] = []
  for (let r = 1; r <= rounds; r++) {
    slotTeams[r].forEach(([a, b], s) => {
      let winner: number | null = null
      if (r === 1) {
        if (a != null && b == null) winner = a
        else if (b != null && a == null) winner = b
      }
      const winnerTo: BracketTarget | null =
        winner == null && r < rounds ? { bracket: 'winners', round: r + 1, slot: Math.floor(s / 2), side: (s % 2) as 0 | 1 } : null
      out.push({
        bracket: 'winners',
        round: r,
        slot: s,
        court: null,
        team_a_id: a,
        team_b_id: b,
        winner_id: winner,
        winner_to: winnerTo,
        loser_to: null,
      })
      if (winner != null && r < rounds) {
        slotTeams[r + 1][Math.floor(s / 2)][s % 2] = winner
      }
    })
  }
  return out
}

// ---- Double elimination ----

const key = (bracket: string, round: number, slot: number) => `${bracket}/${round}/${slot}`

// The "ideal" wiring of a full double-elim bracket of `size` (power of two):
// where every match's winner and loser go, ignoring byes. Byes are collapsed
// out afterwards by the simulation in buildDoubleElimBracket.
function idealDoubleElim(size: number) {
  const wbRounds = Math.log2(size)
  const lbRounds = wbRounds < 2 ? 0 : 2 * (wbRounds - 1)

  const wbCount = (r: number) => size >> r
  // LB round 1 consolidates WB round 1 losers; every later LB "layer" k has a
  // consolidation round (2k-1) and a drop round (2k), both with size>>(k+1)
  // matches.
  const lbCount = (lr: number) => (lr <= 0 ? 0 : size >> (Math.ceil(lr / 2) + 1))

  // WB round r loser feed into losers-bracket drop round 2(r-1). Alternate the
  // slot direction each round so a team is less likely to immediately replay
  // whoever just knocked it down.
  const dropSlot = (r: number, s: number) => {
    const cnt = lbCount(2 * (r - 1))
    return r % 2 === 0 ? cnt - 1 - s : s
  }

  interface Ideal {
    winnerTo: BracketTarget | null
    loserTo: BracketTarget | null
  }
  const ideal = new Map<string, Ideal>()

  for (let r = 1; r <= wbRounds; r++) {
    for (let s = 0; s < wbCount(r); s++) {
      const winnerTo: BracketTarget =
        r < wbRounds
          ? { bracket: 'winners', round: r + 1, slot: s >> 1, side: (s % 2) as 0 | 1 }
          : { bracket: 'final', round: 1, slot: 0, side: 0 }
      const loserTo: BracketTarget =
        lbRounds === 0
          ? { bracket: 'final', round: 1, slot: 0, side: 1 }
          : r === 1
            ? { bracket: 'losers', round: 1, slot: s >> 1, side: (s % 2) as 0 | 1 }
            : { bracket: 'losers', round: 2 * (r - 1), slot: dropSlot(r, s), side: 1 }
      ideal.set(key('winners', r, s), { winnerTo, loserTo })
    }
  }

  for (let lr = 1; lr <= lbRounds; lr++) {
    for (let s = 0; s < lbCount(lr); s++) {
      let winnerTo: BracketTarget
      if (lr === lbRounds) {
        winnerTo = { bracket: 'final', round: 1, slot: 0, side: 1 }
      } else if (lr === 1 || lr % 2 === 0) {
        // consolidation round 1, or a drop round -> next is a consolidation
        // round that pairs winners.
        winnerTo =
          lr === 1
            ? { bracket: 'losers', round: 2, slot: s, side: 0 }
            : { bracket: 'losers', round: lr + 1, slot: s >> 1, side: (s % 2) as 0 | 1 }
      } else {
        // odd consolidation round (>1) -> next drop round, same count.
        winnerTo = { bracket: 'losers', round: lr + 1, slot: s, side: 0 }
      }
      ideal.set(key('losers', lr, s), { winnerTo, loserTo: null })
    }
  }

  ideal.set(key('final', 1, 0), { winnerTo: null, loserTo: null })
  ideal.set(key('final', 2, 0), { winnerTo: null, loserTo: null })

  return { wbRounds, lbRounds, wbCount, lbCount, ideal }
}

// Every match slot in topological order (a match appears after both its
// feeders): WB1, LB1, then for each WB round r>=2 the WB round, its drop round
// 2(r-1), and the following consolidation round 2r-1.
function topoOrder(wbRounds: number, lbRounds: number, wbCount: (r: number) => number, lbCount: (lr: number) => number) {
  const order: { bracket: string; round: number; slot: number }[] = []
  const push = (bracket: string, round: number, count: number) => {
    for (let s = 0; s < count; s++) order.push({ bracket, round, slot: s })
  }
  push('winners', 1, wbCount(1))
  if (lbRounds >= 1) push('losers', 1, lbCount(1))
  for (let r = 2; r <= wbRounds; r++) {
    push('winners', r, wbCount(r))
    const drop = 2 * (r - 1)
    if (drop <= lbRounds) push('losers', drop, lbCount(drop))
    const cons = 2 * r - 1
    if (cons <= lbRounds) push('losers', cons, lbCount(cons))
  }
  push('final', 1, 1)
  push('final', 2, 1)
  return order
}

// Build a double-elimination bracket (winners + losers brackets, grand final,
// and a reset game) from teams in seed order. Byes for a non-power-of-two team
// count are resolved at build time: walkover matches with a known winner are
// emitted as byes and their winner pre-advanced; walkover matches whose winner
// isn't known yet are dropped and the feeding match is wired straight past
// them. The result feeds the same schedule PUT as the single-elim bracket.
export function buildDoubleElimBracket(seededTeamIds: number[]): BuiltMatch[] {
  const n = seededTeamIds.length
  if (n < 2) return []
  const size = nextPowerOfTwo(n)
  const { wbRounds, lbRounds, wbCount, lbCount, ideal } = idealDoubleElim(size)
  const order = standardSeedOrder(size)

  // Simulation state.
  const placed = new Map<string, number>() // "bracket/round/slot/side" -> teamId
  const dead = new Set<string>() // "bracket/round/slot/side" that will never be filled
  const state = new Map<string, 'live' | 'wov' | 'dead'>()
  const wovWinner = new Map<string, number | null>()
  const sideKey = (b: string, r: number, s: number, side: number) => `${b}/${r}/${s}/${side}`

  // Seed WB round 1 and mark the empty (bye) sides dead.
  for (let s = 0; s < wbCount(1); s++) {
    for (const side of [0, 1] as const) {
      const seed = order[2 * s + side]
      if (seed <= n) placed.set(sideKey('winners', 1, s, side), seededTeamIds[seed - 1])
      else dead.add(sideKey('winners', 1, s, side))
    }
  }

  const steps = topoOrder(wbRounds, lbRounds, wbCount, lbCount)
  for (const { bracket, round, slot } of steps) {
    const k = key(bracket, round, slot)
    const a = placed.get(sideKey(bracket, round, slot, 0)) ?? null
    const b = placed.get(sideKey(bracket, round, slot, 1)) ?? null
    const aDead = dead.has(sideKey(bracket, round, slot, 0))
    const bDead = dead.has(sideKey(bracket, round, slot, 1))
    const teams = [a, b].filter((x): x is number => x != null)

    let st: 'live' | 'wov' | 'dead'
    let wov: number | null = null
    if (teams.length === 2) {
      st = 'live'
    } else if (teams.length === 1) {
      const otherDead = a == null ? aDead : bDead
      if (otherDead) {
        st = 'wov'
        wov = teams[0]
      } else {
        st = 'live'
      }
    } else if (aDead && bDead) {
      st = 'dead'
    } else if (aDead !== bDead) {
      // One side permanently empty, the other still waiting on a live feeder:
      // a walkover whose winner isn't known yet. Drop it.
      st = 'wov'
      wov = null
    } else {
      st = 'live'
    }
    state.set(k, st)
    wovWinner.set(k, wov)

    // Propagate to the ideal downstream targets.
    const spec = ideal.get(k)
    if (!spec) continue
    if (st === 'dead') {
      for (const t of [spec.winnerTo, spec.loserTo]) {
        if (t) dead.add(sideKey(t.bracket, t.round, t.slot, t.side))
      }
    } else if (st === 'wov') {
      if (spec.loserTo) dead.add(sideKey(spec.loserTo.bracket, spec.loserTo.round, spec.loserTo.slot, spec.loserTo.side))
      if (spec.winnerTo && wov != null) {
        placed.set(sideKey(spec.winnerTo.bracket, spec.winnerTo.round, spec.winnerTo.slot, spec.winnerTo.side), wov)
      }
    }
  }

  // Collapse a wiring target through any dropped (unknown-winner) walkovers.
  const collapse = (t: BracketTarget | null): BracketTarget | null => {
    let cur = t
    while (cur) {
      const st = state.get(key(cur.bracket, cur.round, cur.slot))
      if (st === 'live') return cur
      if (st === 'dead' || st === undefined) return null
      // walkover: the team routed here becomes its winner, so follow on.
      const spec = ideal.get(key(cur.bracket, cur.round, cur.slot))
      cur = spec?.winnerTo ?? null
    }
    return null
  }

  const out: BuiltMatch[] = []
  for (const { bracket, round, slot } of steps) {
    const k = key(bracket, round, slot)
    const st = state.get(k)
    const spec = ideal.get(k)
    if (st === 'dead' || !spec) continue
    if (st === 'wov' && wovWinner.get(k) == null) continue // dropped

    const a = placed.get(sideKey(bracket, round, slot, 0)) ?? null
    const b = placed.get(sideKey(bracket, round, slot, 1)) ?? null
    if (st === 'wov') {
      // A real bye: one known team, emitted with the winner pre-set. Not wired
      // — its winner is already pre-advanced into the downstream slot.
      out.push({
        bracket,
        round,
        slot,
        court: null,
        team_a_id: a,
        team_b_id: b,
        winner_id: wovWinner.get(k) ?? null,
        winner_to: null,
        loser_to: null,
      })
      continue
    }
    // Grand final round 1's routing is handled specially on result (the reset
    // game only happens if the losers-bracket team wins), so leave it unwired.
    const wireable = !(bracket === 'final' && round === 1)
    const winnerTo = wireable ? collapse(spec.winnerTo) : null
    // Every live match except the two grand-final games must send its winner
    // somewhere; a null here means the simulation lost a slot.
    if (winnerTo == null && bracket !== 'final') {
      throw new Error(`double-elim bracket: ${k} has no winner destination`)
    }
    out.push({
      bracket,
      round,
      slot,
      court: null,
      team_a_id: a,
      team_b_id: b,
      winner_id: null,
      winner_to: winnerTo,
      loser_to: wireable ? collapse(spec.loserTo) : null,
    })
  }
  return out
}
