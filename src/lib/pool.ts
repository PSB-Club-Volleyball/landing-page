import { buildRoundRobinSchedule } from './schedule'
import type { PoolStanding, ScheduleInput } from '../types'

// Pools are labelled A, B, C, … in assignment order.
export function poolLabel(index: number): string {
  return String.fromCharCode(65 + index)
}

// Largest pool count that still gives every pool at least two teams. Anything
// larger would leave a pool with a single team (no round-robin, no standings),
// so callers clamp the admin's requested count through here.
export function clampPoolCount(requested: number, teamCount: number): number {
  return Math.max(1, Math.min(Math.floor(requested) || 1, Math.floor(teamCount / 2) || 1))
}

// Snake-draft pool label (A, B, C, …) for the team at seed position `idx` when
// there are `count` pools, so each pool gets a balanced spread of seeds. The
// server relies on this exact assignment when it seeds the bracket, so both
// sides import it from here rather than reimplementing the formula.
export function poolLabelAt(idx: number, count: number): string {
  const row = Math.floor(idx / count)
  const col = idx % count
  return poolLabel(row % 2 === 0 ? col : count - 1 - col)
}

// Round-robin schedule for every pool, played in parallel: the courts are
// divided between the pools and every pool shares the same time slots.
export function buildPoolSchedule(pools: number[][], courts: number): ScheduleInput['matches'] {
  const courtsPerPool = Math.max(1, Math.floor(Math.max(1, courts) / pools.length))
  const out: ScheduleInput['matches'] = []
  pools.forEach((teamIds, pi) => {
    const label = poolLabel(pi)
    for (const m of buildRoundRobinSchedule(teamIds, courtsPerPool, false)) {
      out.push({
        ...m,
        pool: label,
        court: m.court ? String(Number(m.court) + pi * courtsPerPool) : null,
      })
    }
  })
  return out
}

// Team ids to seed the knockout bracket with, `advance` from each pool.
// Interleaved by finishing place (all pool winners, then all runners-up, …)
// so the standard bracket seeding pits a pool winner against another pool's
// runner-up in round 1.
export function seedFromPools(pools: PoolStanding[], advance: number): number[] {
  const seeds: number[] = []
  for (let place = 0; place < advance; place++) {
    for (const pool of pools) {
      const row = pool.standings[place]
      if (row) seeds.push(row.team_id)
    }
  }
  return seeds
}
