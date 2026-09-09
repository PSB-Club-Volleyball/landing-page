import type { ReactNode } from 'react'
import type { EventMatch } from '../types'
import { roundName } from '../lib/bracketLabels'

// Shared read-only bracket layout for single- and double-elimination, used by
// both the public event page and the admin schedule tab. `renderExtra` hangs
// something off each match — a score line on the public side, score inputs on
// the admin side.
export function BracketColumns({
  matches,
  renderExtra,
}: {
  matches: EventMatch[]
  renderExtra?: (m: EventMatch) => ReactNode
}) {
  const winners = matches.filter((m) => m.bracket === 'winners')
  const losers = matches.filter((m) => m.bracket === 'losers')
  const finals = matches.filter((m) => m.bracket === 'final').sort((a, b) => a.round - b.round)
  if (winners.length === 0 && losers.length === 0 && finals.length === 0) return null

  const wbRounds = [...new Set(winners.map((m) => m.round))].sort((a, b) => a - b)
  const lbRounds = [...new Set(losers.map((m) => m.round))].sort((a, b) => a - b)
  const wbLast = wbRounds[wbRounds.length - 1] ?? 0

  const matchCard = (m: EventMatch) => {
    const oneTeam = (m.team_a_id == null) !== (m.team_b_id == null)
    const bye = oneTeam && m.winner_id != null
    return (
      <div className={bye ? 'bracket-match bye' : 'bracket-match'} key={m.id}>
        <div className="bm-teams">
          <span className={m.winner_id != null && m.winner_id === m.team_a_id ? 'bm-team win' : 'bm-team'}>
            {m.team_a_name ?? 'TBD'}
          </span>
          <span className={m.winner_id != null && m.winner_id === m.team_b_id ? 'bm-team win' : 'bm-team'}>
            {m.team_b_name ?? (bye ? 'Bye' : 'TBD')}
          </span>
        </div>
        {renderExtra?.(m)}
      </div>
    )
  }

  const column = (label: string, roundMatches: EventMatch[]) => (
    <div className="bracket-col" key={label}>
      <h4>{label}</h4>
      {roundMatches.sort((a, b) => a.slot - b.slot).map(matchCard)}
    </div>
  )

  return (
    <div className="bracket-board">
      {winners.length > 0 && (
        <div className="bracket-section">
          {losers.length > 0 && <h3 className="bracket-section-title">Winners bracket</h3>}
          <div className="bracket-grid">
            {wbRounds.map((r) => column(roundName(r, wbLast), winners.filter((m) => m.round === r)))}
          </div>
        </div>
      )}
      {losers.length > 0 && (
        <div className="bracket-section">
          <h3 className="bracket-section-title">Losers bracket</h3>
          <div className="bracket-grid">
            {lbRounds.map((r, i) => column(`Round ${i + 1}`, losers.filter((m) => m.round === r)))}
          </div>
        </div>
      )}
      {finals.length > 0 && (
        <div className="bracket-section">
          <h3 className="bracket-section-title">Grand final</h3>
          <div className="bracket-grid">
            {finals.map((m) => {
              const reset = m.round === 2
              // The reset game only exists on paper until the losers-bracket
              // team forces it.
              if (reset && m.team_a_id == null && m.winner_id == null) {
                return (
                  <div className="bracket-col" key={m.id}>
                    <h4>Reset</h4>
                    <div className="bracket-match muted">
                      <div className="bm-teams">
                        <span className="bm-team">If necessary</span>
                      </div>
                    </div>
                  </div>
                )
              }
              return column(reset ? 'Reset' : 'Final', [m])
            })}
          </div>
        </div>
      )}
    </div>
  )
}
