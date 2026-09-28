import { scoreLine, slotTime } from '../lib/matchFormat'
import type { EventMatch, PoolStanding } from '../types'
import StandingsTable from './StandingsTable'

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
            {played && <StandingsTable standings={pool.standings} />}
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
                      <span className="pm-v">vs</span>
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
