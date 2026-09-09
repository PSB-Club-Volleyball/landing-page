import type { ScheduleInput } from '../types'

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
export function buildSingleElimBracket(seededTeamIds: number[]): ScheduleInput['matches'] {
  const n = seededTeamIds.length
  if (n < 2) return []
  const size = nextPowerOfTwo(n)
  const rounds = Math.log2(size)
  const order = standardSeedOrder(size)

  // Round-1 slot s is fed by bracket positions 2s and 2s+1.
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
  // yet (TBD), it is not a bye. Courts are spread across the matches actually
  // played in each round.
  const out: ScheduleInput['matches'] = []
  for (let r = 1; r <= rounds; r++) {
    slotTeams[r].forEach(([a, b], s) => {
      let winner: number | null = null
      if (r === 1) {
        if (a != null && b == null) winner = a
        else if (b != null && a == null) winner = b
      }
      out.push({ bracket: 'winners', round: r, slot: s, court: null, team_a_id: a, team_b_id: b, winner_id: winner })
      if (winner != null && r < rounds) {
        slotTeams[r + 1][Math.floor(s / 2)][s % 2] = winner
      }
    })
  }
  return out
}
