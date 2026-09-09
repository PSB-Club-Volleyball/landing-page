import type { EventMatch } from '../types'
import { BracketColumns } from './BracketColumns'

function scoreLine(m: EventMatch): string | null {
  if (m.forfeit_team_id != null) return 'Forfeit'
  if (!m.scores || m.scores.length === 0) return null
  return m.scores.map(([a, b]) => `${a}–${b}`).join(', ')
}

// The champion is the winner of the last decided grand-final game (double
// elim) or the last winners-bracket round (single elim).
function championName(matches: EventMatch[]): string | null {
  const decided = matches
    .filter((m) => (m.bracket === 'final' || m.bracket === 'winners') && m.winner_id != null)
    .sort((a, b) => {
      const rank = (x: EventMatch) => (x.bracket === 'final' ? 100 + x.round : x.round)
      return rank(b) - rank(a)
    })
  const last = decided[0]
  if (!last) return null
  return last.winner_id === last.team_a_id ? last.team_a_name : last.team_b_name
}

// Read-only bracket on the public event page's Bracket tab (single or double
// elimination).
export default function EventBracket({ matches }: { matches: EventMatch[] }) {
  const bracket = matches.filter((m) => m.bracket === 'winners' || m.bracket === 'losers' || m.bracket === 'final')
  if (bracket.length === 0) return null
  const champ = championName(bracket)

  return (
    <div className="public-bracket-wrap">
      {champ && (
        <p className="bracket-champ">
          Champion: <b>{champ}</b>
        </p>
      )}
      <BracketColumns
        matches={bracket}
        renderExtra={(m) => {
          const s = scoreLine(m)
          return s ? <span className="bm-score">{s}</span> : null
        }}
      />
    </div>
  )
}
