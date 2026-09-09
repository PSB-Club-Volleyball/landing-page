import type { EventMatch, StandingRow } from '../types'

const timeFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' })
function slotTime(iso: string | null) {
  return iso ? timeFmt.format(new Date(iso)) : ''
}

function scoreLine(m: EventMatch) {
  if (m.forfeit_team_id != null) return 'Forfeit'
  if (!m.scores || m.scores.length === 0) return null
  return m.scores.map(([a, b]) => `${a}–${b}`).join(', ')
}

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

  return (
    <div className="public-scores">
      {!timedOnly && standings.length > 0 && (
        <>
          <h2>Standings</h2>
          <div className="data-table public-standings">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Team</th>
                  <th>W</th>
                  <th>L</th>
                  <th>Sets</th>
                  <th>Pts</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((r, i) => (
                  <tr key={r.team_id}>
                    <td>{i + 1}</td>
                    <td>{r.name}</td>
                    <td>{r.wins}</td>
                    <td>{r.losses}</td>
                    <td>
                      {r.sets_won}&ndash;{r.sets_lost}
                    </td>
                    <td>
                      {r.points_for - r.points_against > 0 ? '+' : ''}
                      {r.points_for - r.points_against}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2>{timedOnly ? 'Schedule' : 'Matches'}</h2>
      {rounds.map((round) => (
        <div className="public-match-round" key={round}>
          <h3>Round {round}</h3>
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
                      <span className="pm-v">v</span>
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
