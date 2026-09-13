import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, getMembers } from '../lib/api'
import { MIN_RANKED_GAMES, wilsonLowerBound } from '../lib/ranking'
import type { MemberSummary } from '../types'

function initials(name: string | null) {
  const source = name || '?'
  return source
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function Leaderboard() {
  const [members, setMembers] = useState<MemberSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    getMembers()
      .then((res) => setMembers(res.members))
      .catch((e: Error) => {
        setError(e instanceof ApiError && e.status === 401 ? 'Sign in to view the leaderboard.' : e.message)
      })
  }, [])

  const played = (m: MemberSummary) => m.wins + m.losses

  const ranked = useMemo(() => {
    if (!members) return null
    return members
      .filter((m) => played(m) >= MIN_RANKED_GAMES)
      .sort((a, b) => wilsonLowerBound(b.wins, played(b)) - wilsonLowerBound(a.wins, played(a)))
  }, [members])

  const unranked = useMemo(() => {
    if (!members) return null
    return members
      .filter((m) => played(m) > 0 && played(m) < MIN_RANKED_GAMES)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }, [members])

  const q = query.trim().toLowerCase()
  const filteredRanked = useMemo(
    () => (ranked && q ? ranked.filter((m) => (m.name || 'member').toLowerCase().includes(q)) : ranked),
    [ranked, q],
  )
  const filteredUnranked = useMemo(
    () => (unranked && q ? unranked.filter((m) => (m.name || 'member').toLowerCase().includes(q)) : unranked),
    [unranked, q],
  )

  const podium = filteredRanked?.slice(0, 3) ?? []
  const rest = filteredRanked?.slice(3) ?? []
  const isEmpty =
    !error && filteredRanked && filteredUnranked && filteredRanked.length === 0 && filteredUnranked.length === 0

  return (
    <main id="main-content" tabIndex={-1}>
      <div className="board legal-page">
        <div className="directory-head">
          <div>
            <h1>Leaderboard</h1>
            {members && (
              <p className="directory-count">
                {ranked?.length ?? 0} ranked ({MIN_RANKED_GAMES}+ games) &middot; {unranked?.length ?? 0} not yet
                ranked
              </p>
            )}
            <div className="directory-toggle">
              <Link to="/people">People</Link>
              <span className="active">Leaderboard</span>
            </div>
          </div>
          <input
            type="search"
            className="directory-search"
            placeholder="Search by name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search leaderboard by name"
          />
        </div>

        {error && <p className="placeholder-note">{error}</p>}
        {!error && !members && <p>Loading&hellip;</p>}
        {isEmpty && <p className="placeholder-note">No one matches that search.</p>}

        {!error && members && filteredRanked && filteredRanked.length === 0 && filteredUnranked?.length === 0 && q === '' && (
          <p className="placeholder-note">No results yet — check back once matches have been played.</p>
        )}

        {podium.length > 0 && (
          <div className="podium">
            {podium.map((m, i) => (
              <Link key={m.id} to={`/members/${m.id}`} className={`podium-card rank-${i + 1}`}>
                <div className="podium-rank">{['1st', '2nd', '3rd'][i]}</div>
                <div className="podium-name">{m.name || 'Member'}</div>
                <div className="podium-pct">{m.winPct.toFixed(3).replace(/^0/, '')}</div>
                <div className="podium-wl muted-sub">
                  {m.wins}&ndash;{m.losses}
                </div>
              </Link>
            ))}
          </div>
        )}

        {rest.length > 0 && (
          <ul className="leaderboard">
            {rest.map((m, i) => (
              <li key={m.id} className="leaderboard-row">
                <Link to={`/members/${m.id}`}>
                  <span className="leaderboard-rank">{i + 4}</span>
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

        {filteredUnranked && filteredUnranked.length > 0 && (
          <>
            <div className="section-label">
              Not yet ranked <span className="count">{filteredUnranked.length}</span>
            </div>
            <p className="muted-sub unranked-note">
              Fewer than {MIN_RANKED_GAMES} games played — shown by record, not ranked against the board above.
            </p>
            <ul className="chip-flow">
              {filteredUnranked.map((m) => (
                <li key={m.id}>
                  <Link to={`/members/${m.id}`} className="chip">
                    <span className="chip-avatar">{initials(m.name)}</span>
                    {m.name || 'Member'} &middot; {m.wins}&ndash;{m.losses}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </main>
  )
}

export default Leaderboard
