import type { ScheduleInput } from '../types'

// Round-robin pairings by the circle method. With an odd team count a phantom
// -1 ("bye") is added; pairs containing it are dropped. Returns one array of
// [teamId, teamId] pairs per round.
export function roundRobinRounds(teamIds: number[]): [number, number][][] {
  const ids = teamIds.slice()
  if (ids.length < 2) return []
  if (ids.length % 2 === 1) ids.push(-1)
  const n = ids.length
  const rounds: [number, number][][] = []
  const fixed = ids[0]
  let rotating = ids.slice(1)
  for (let r = 0; r < n - 1; r++) {
    const order = [fixed, ...rotating]
    const pairs: [number, number][] = []
    for (let i = 0; i < n / 2; i++) {
      const a = order[i]
      const b = order[n - 1 - i]
      if (a !== -1 && b !== -1) pairs.push([a, b])
    }
    rounds.push(pairs)
    rotating = [rotating[rotating.length - 1], ...rotating.slice(0, -1)]
  }
  return rounds
}

// Full round-robin schedule: rounds -> matches assigned to courts and
// sequential time slots. Within a round every pairing can play at once when
// there are enough courts; otherwise the round spills into extra slots.
export function buildRoundRobinSchedule(
  teamIds: number[],
  courts: number,
  doubleRoundRobin: boolean
): ScheduleInput['matches'] {
  const courtCount = Math.max(1, courts)
  let rounds = roundRobinRounds(teamIds)
  if (doubleRoundRobin) rounds = [...rounds, ...rounds.map((pairs) => pairs.map(([a, b]) => [b, a] as [number, number]))]

  const matches: ScheduleInput['matches'] = []
  let slot = 0
  rounds.forEach((pairs, roundIdx) => {
    pairs.forEach(([a, b], i) => {
      matches.push({
        bracket: 'pool',
        round: roundIdx + 1,
        slot: slot + Math.floor(i / courtCount),
        court: String((i % courtCount) + 1),
        team_a_id: a,
        team_b_id: b,
      })
    })
    const slotsUsed = Math.max(1, Math.ceil(pairs.length / courtCount))
    slot += slotsUsed
  })
  return matches
}
