import type { EventMatch } from '../types'
import { roundName } from '../lib/bracketLabels'

function scoreLine(m: EventMatch): string | null {
  if (m.forfeit_team_id != null) return 'Forfeit'
  if (!m.scores || m.scores.length === 0) return null
  return m.scores.map(([a, b]) => `${a}–${b}`).join(', ')
}

// Read-only single-elimination bracket on the public event page's Bracket tab.
export default function EventBracket({ matches }: { matches: EventMatch[] }) {
  const bracket = matches.filter((m) => m.bracket === 'winners')
  if (bracket.length === 0) return null
  const rounds = [...new Set(bracket.map((m) => m.round))].sort((a, b) => a - b)
  const totalRounds = rounds[rounds.length - 1]

  const finalMatch = bracket.find((m) => m.round === totalRounds)
  const champ =
    finalMatch?.winner_id != null
      ? finalMatch.winner_id === finalMatch.team_a_id
        ? finalMatch.team_a_name
        : finalMatch.team_b_name
      : null

  return (
    <div className="public-bracket-wrap">
      {champ && (
        <p className="bracket-champ">
          Champion: <b>{champ}</b>
        </p>
      )}
      <div className="bracket-grid">
        {rounds.map((round) => (
          <div className="bracket-col" key={round}>
            <h3>{roundName(round, totalRounds)}</h3>
            {bracket
              .filter((m) => m.round === round)
              .sort((a, b) => a.slot - b.slot)
              .map((m) => {
                const oneTeam = (m.team_a_id == null) !== (m.team_b_id == null)
                const bye = oneTeam && m.winner_id != null
                const score = scoreLine(m)
                return (
                  <div className={bye ? 'bracket-match bye' : 'bracket-match'} key={m.id}>
                    <span className={m.winner_id != null && m.winner_id === m.team_a_id ? 'bm-team win' : 'bm-team'}>
                      {m.team_a_name ?? 'TBD'}
                    </span>
                    <span className={m.winner_id != null && m.winner_id === m.team_b_id ? 'bm-team win' : 'bm-team'}>
                      {m.team_b_name ?? (bye ? 'Bye' : 'TBD')}
                    </span>
                    {score && <span className="bm-score">{score}</span>}
                  </div>
                )
              })}
          </div>
        ))}
      </div>
    </div>
  )
}
