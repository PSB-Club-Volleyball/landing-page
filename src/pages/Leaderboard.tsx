import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, getMembers } from '../lib/api'
import type { MemberSummary } from '../types'

function Leaderboard() {
  const [members, setMembers] = useState<MemberSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getMembers()
      .then((res) => setMembers(res.members))
      .catch((e: Error) => {
        setError(e instanceof ApiError && e.status === 401 ? 'Sign in to view the leaderboard.' : e.message)
      })
  }, [])

  const ranked = useMemo(() => members?.filter((m) => m.wins + m.losses > 0) ?? null, [members])

  return (
    <main id="main-content" tabIndex={-1}>
      <div className="board legal-page">
        <div className="directory-head">
          <div>
            <h1>Leaderboard</h1>
            <div className="directory-toggle">
              <Link to="/people">People</Link>
              <span className="active">Leaderboard</span>
            </div>
          </div>
        </div>

        {error && <p className="placeholder-note">{error}</p>}
        {!error && !ranked && <p>Loading&hellip;</p>}
        {!error && ranked && ranked.length === 0 && (
          <p className="placeholder-note">No results yet — check back once matches have been played.</p>
        )}
        {!error && ranked && ranked.length > 0 && (
          <ul className="leaderboard">
            {ranked.map((m, i) => (
              <li key={m.id} className={i === 0 ? 'leaderboard-row top' : 'leaderboard-row'}>
                <Link to={`/members/${m.id}`}>
                  <span className="leaderboard-rank">{i + 1}</span>
                  <span className="leaderboard-name">{m.name || 'Member'}</span>
                  {m.currentStreak >= 2 && <span className="leaderboard-streak">{m.currentStreak}W streak</span>}
                  <span className="leaderboard-record">
                    <span className="leaderboard-pct">{m.winPct.toFixed(3).replace(/^0/, '')}</span>
                    <span className="leaderboard-wl">
                      {m.wins}&ndash;{m.losses}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}

export default Leaderboard
