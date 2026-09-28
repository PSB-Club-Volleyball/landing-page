import { scoreLine, slotTime } from '../lib/matchFormat'
import type { EventMatch, StandingRow } from '../types'
import StandingsTable from './StandingsTable'

// Read-only schedule + standings on the public event page's Scores tab.
export default function EventScores({
  matches,
  standings,
  timedOnly,
}: {
  matches: EventMatch[]
  standings: StandingRow[]
  timedOnly: boolean
}) {
  if (matches.length === 0) return null
  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b)
  const roundLabel = (round: number) => {
    if (!timedOnly) return `Round ${round}`
    const first = matches.find((m) => m.round === round)
    return slotTime(first?.start_time ?? null) || `Round ${round}`
  }

  return (
    <div className="public-scores">
      {!timedOnly && standings.length > 0 && (
        <>
          <h2>Standings</h2>
          <StandingsTable standings={standings} />
        </>
      )}

      <h2>{timedOnly ? 'Schedule' : 'Matches'}</h2>
      {rounds.map((round) => (
        <div className="public-match-round" key={round}>
          <h3>{roundLabel(round)}</h3>
          <ul className="public-match-list">
            {matches
              .filter((m) => m.round === round)
              .map((m) => {
                const score = scoreLine(m)
                return (
                  <li key={m.id}>
                    <span className="pm-when">
                      {slotTime(m.start_time)}
                      {m.court && <span className="pm-court">Court {m.court}</span>}
                    </span>
                    <span className="pm-teams">
                      <span className={m.winner_id === m.team_a_id ? 'pm-team win' : 'pm-team'}>{m.team_a_name}</span>
                      <span className="pm-v">vs</span>
                      <span className={m.winner_id === m.team_b_id ? 'pm-team win' : 'pm-team'}>{m.team_b_name}</span>
                    </span>
                    {!timedOnly && <span className="pm-score">{score ?? '—'}</span>}
                  </li>
                )
              })}
          </ul>
        </div>
      ))}
    </div>
  )
}
