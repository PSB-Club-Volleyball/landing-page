import type { EventMatch, PoolStanding } from '../types'

const timeFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' })
function slotTime(iso: string | null) {
  return iso ? timeFmt.format(new Date(iso)) : ''
}

function scoreLine(m: EventMatch): string | null {
  if (m.forfeit_team_id != null) return 'Forfeit'
  if (!m.scores || m.scores.length === 0) return null
  return m.scores.map(([a, b]) => `${a}–${b}`).join(', ')
}

// Read-only pool standings + pool match lists on the public event page's Pools
// tab. Once the knockout stage starts it moves to its own Bracket tab.
export default function EventPools({ pools, matches }: { pools: PoolStanding[]; matches: EventMatch[] }) {
  const poolMatches = matches.filter((m) => m.bracket === 'pool')
  if (pools.length === 0) return null

  return (
    <div className="public-scores">
      {pools.map((pool) => {
        const pm = poolMatches.filter((m) => m.pool === pool.label)
        const played = pool.standings.some((r) => r.played > 0)
        return (
          <section className="public-pool" key={pool.label}>
            <h2>Pool {pool.label}</h2>
            {played && (
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
                    {pool.standings.map((r, i) => (
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
            )}
            <ul className="public-match-list">
              {pm.map((m) => {
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
                    <span className="pm-score">{score ?? '—'}</span>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
