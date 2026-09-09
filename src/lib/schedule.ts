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

// Full round-robin schedule. The circle-method pairings are packed into a grid
// of `courts` columns by time slot: each match takes the earliest slot where a
// court is free, neither team is already playing, and — where possible —
// neither team played the slot immediately before (so nobody goes
// back-to-back). The number of courts therefore changes the match order, not
// just the labels: on one court the rotation is interleaved to spread each
// team's rest evenly.
export function buildRoundRobinSchedule(
  teamIds: number[],
  courts: number,
  doubleRoundRobin: boolean
): ScheduleInput['matches'] {
  const courtCount = Math.max(1, Math.floor(courts))
  let rounds = roundRobinRounds(teamIds)
  if (doubleRoundRobin) {
    rounds = [...rounds, ...rounds.map((pairs) => pairs.map(([a, b]) => [b, a] as [number, number]))]
  }
  const pairs = rounds.flat()

  const slotTeams: Set<number>[] = []
  const slotFill: number[] = []
  const placed: { slot: number; court: number; a: number; b: number }[] = []

  const hardFits = (s: number, a: number, b: number) =>
    (slotFill[s] ?? 0) < courtCount && !slotTeams[s]?.has(a) && !slotTeams[s]?.has(b)
  const notBackToBack = (s: number, a: number, b: number) =>
    s === 0 || (!slotTeams[s - 1]?.has(a) && !slotTeams[s - 1]?.has(b))

  for (const [a, b] of pairs) {
    // Prefer, among slots that already exist, the earliest that keeps a team
    // off back-to-back matches; then the earliest that just fits; only then
    // open a new slot. This keeps courts busy (a new slot is never created
    // merely to dodge a back-to-back) while `courts` still drives the layout.
    let target = -1
    for (let s = 0; s < slotTeams.length; s++) {
      if (hardFits(s, a, b) && notBackToBack(s, a, b)) {
        target = s
        break
      }
    }
    if (target === -1) {
      for (let s = 0; s < slotTeams.length; s++) {
        if (hardFits(s, a, b)) {
          target = s
          break
        }
      }
    }
    if (target === -1) {
      target = slotTeams.length
      slotTeams.push(new Set())
      slotFill.push(0)
    }
    const court = slotFill[target]
    slotFill[target] = court + 1
    slotTeams[target].add(a)
    slotTeams[target].add(b)
    placed.push({ slot: target, court, a, b })
  }

  return placed.map((p) => ({
    bracket: 'pool',
    round: p.slot + 1,
    slot: p.slot,
    court: String(p.court + 1),
    team_a_id: p.a,
    team_b_id: p.b,
  }))
}
