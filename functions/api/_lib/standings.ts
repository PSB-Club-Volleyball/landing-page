// Match-result + standings maths, shared by the admin matches endpoint and
// the public single-event endpoint.

export interface MatchLike {
  team_a_id: number | null
  team_b_id: number | null
  scores: [number, number][] | null
  forfeit_team_id: number | null
}

export function setsToWin(setsPerMatch: number): number {
  return Math.floor(setsPerMatch / 2) + 1
}

// The winning team id for a *completed* match, or null if it isn't decided
// yet — a match only counts once one side has actually taken `setsToWin`
// sets. A forfeit hands the win to the other team regardless of any scores.
export function matchWinnerId(m: MatchLike, setsPerMatch: number): number | null {
  if (m.team_a_id == null || m.team_b_id == null) return null
  if (m.forfeit_team_id != null) {
    return m.forfeit_team_id === m.team_a_id ? m.team_b_id : m.team_a_id
  }
  if (!m.scores || m.scores.length === 0) return null
  const need = setsToWin(setsPerMatch)
  let a = 0
  let b = 0
  for (const [sa, sb] of m.scores) {
    if (sa > sb) a++
    else if (sb > sa) b++
  }
  if (a >= need && a > b) return m.team_a_id
  if (b >= need && b > a) return m.team_b_id
  return null
}

export interface StandingRow {
  team_id: number
  name: string
  played: number
  wins: number
  losses: number
  sets_won: number
  sets_lost: number
  points_for: number
  points_against: number
}

// Ranked standings for a set of teams over a set of matches. A forfeit counts
// as a 2-0 loss with a fixed ±50 point swing so a no-show still moves the
// table. Tiebreak: wins, then set differential, then point differential, then
// head-to-head (only when exactly two teams are level), then name.
export function computeStandings(
  teams: { id: number; name: string }[],
  matches: MatchLike[],
  setsPerMatch: number
): StandingRow[] {
  const rows = new Map<number, StandingRow>()
  for (const t of teams) {
    rows.set(t.id, {
      team_id: t.id,
      name: t.name,
      played: 0,
      wins: 0,
      losses: 0,
      sets_won: 0,
      sets_lost: 0,
      points_for: 0,
      points_against: 0,
    })
  }

  for (const m of matches) {
    if (m.team_a_id == null || m.team_b_id == null || m.team_a_id === m.team_b_id) continue
    const ra = rows.get(m.team_a_id)
    const rb = rows.get(m.team_b_id)
    if (!ra || !rb) continue
    const winner = matchWinnerId(m, setsPerMatch)
    if (winner == null) continue

    ra.played++
    rb.played++

    if (m.forfeit_team_id != null) {
      const loser = m.forfeit_team_id === m.team_a_id ? ra : rb
      const won = loser === ra ? rb : ra
      won.wins++
      loser.losses++
      won.sets_won += 2
      loser.sets_lost += 2
      won.points_for += 50
      loser.points_against += 50
      continue
    }

    let aSets = 0
    let bSets = 0
    for (const [sa, sb] of m.scores ?? []) {
      ra.points_for += sa
      ra.points_against += sb
      rb.points_for += sb
      rb.points_against += sa
      if (sa > sb) aSets++
      else if (sb > sa) bSets++
    }
    ra.sets_won += aSets
    ra.sets_lost += bSets
    rb.sets_won += bSets
    rb.sets_lost += aSets
    if (winner === m.team_a_id) {
      ra.wins++
      rb.losses++
    } else {
      rb.wins++
      ra.losses++
    }
  }

  const list = [...rows.values()]
  const setDiff = (r: StandingRow) => r.sets_won - r.sets_lost
  const ptDiff = (r: StandingRow) => r.points_for - r.points_against

  list.sort((x, y) => {
    if (y.wins !== x.wins) return y.wins - x.wins
    if (setDiff(y) !== setDiff(x)) return setDiff(y) - setDiff(x)
    if (ptDiff(y) !== ptDiff(x)) return ptDiff(y) - ptDiff(x)
    // Head-to-head only decides a straight two-way tie. Sum the meetings so a
    // double round robin split 1-1 stays tied and falls through to name.
    const tiedWith = list.filter(
      (r) => r.wins === x.wins && setDiff(r) === setDiff(x) && ptDiff(r) === ptDiff(x)
    )
    if (tiedWith.length === 2) {
      let xh2h = 0
      let yh2h = 0
      for (const m of matches) {
        if (
          (m.team_a_id === x.team_id && m.team_b_id === y.team_id) ||
          (m.team_a_id === y.team_id && m.team_b_id === x.team_id)
        ) {
          const w = matchWinnerId(m, setsPerMatch)
          if (w === x.team_id) xh2h++
          else if (w === y.team_id) yh2h++
        }
      }
      if (xh2h !== yh2h) return yh2h - xh2h
    }
    return x.name.localeCompare(y.name)
  })
  return list
}
