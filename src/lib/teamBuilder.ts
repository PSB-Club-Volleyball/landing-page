// Fisher–Yates shuffle, then deal round-robin into `teamCount` buckets so
// sizes differ by at most one. v1 team-building is random only; "balance by
// position" is a later addition.
export function distributeTeams<T>(people: T[], teamCount: number): T[][] {
  const shuffled = people.slice()
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  const teams: T[][] = Array.from({ length: Math.max(1, teamCount) }, () => [])
  shuffled.forEach((person, i) => teams[i % teams.length].push(person))
  return teams
}
