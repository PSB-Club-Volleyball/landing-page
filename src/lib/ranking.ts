// Players need at least this many games before their record ranks them
// against everyone else — otherwise an early 1-0 would outrank a proven
// 5-1 on raw win%.
export const MIN_RANKED_GAMES = 3

// 95% Wilson score lower bound on a win rate. Used instead of raw win% to
// sort ranked players: it discounts small samples (a 2-0 record scores
// lower than an 8-2 one) without needing a second manual threshold.
// https://en.wikipedia.org/wiki/Binomial_proportion_confidence_interval#Wilson_score_interval
export function wilsonLowerBound(wins: number, games: number, z = 1.96): number {
  if (games === 0) return 0
  const p = wins / games
  const denom = 1 + (z * z) / games
  const center = p + (z * z) / (2 * games)
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * games)) / games)
  return (center - margin) / denom
}
