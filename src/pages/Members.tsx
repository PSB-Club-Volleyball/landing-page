import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, getMembers } from '../lib/api'
import type { MemberSummary } from '../types'

function Members() {
  const [members, setMembers] = useState<MemberSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getMembers()
      .then((res) => setMembers(res.members))
      .catch((e: Error) => {
        setError(e instanceof ApiError && e.status === 401 ? 'Sign in to view the members directory.' : e.message)
      })
  }, [])

  return (
    <main id="main-content" tabIndex={-1}>
      <div className="board legal-page">
        <h1>Members</h1>
        <p className="admin-note">
          Match records across every event this season, ranked by win rate. Skill level stays private to each
          account.
        </p>

        {error && <p className="placeholder-note">{error}</p>}
        {!error && !members && <p>Loading&hellip;</p>}
        {!error && members && members.length === 0 && (
          <p className="placeholder-note">No results yet — check back once matches have been played.</p>
        )}
        {!error && members && members.length > 0 && (
          <ul className="leaderboard">
            {members.map((m, i) => (
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

export default Members
