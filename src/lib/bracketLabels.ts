// Human name for a knockout round: the last round is the final, the one
// before it the semis, etc.; earlier rounds are "Round of N".
export function roundName(round: number, totalRounds: number): string {
  const fromEnd = totalRounds - round
  if (fromEnd === 0) return 'Final'
  if (fromEnd === 1) return 'Semifinals'
  if (fromEnd === 2) return 'Quarterfinals'
  return `Round of ${2 ** (fromEnd + 1)}`
}
