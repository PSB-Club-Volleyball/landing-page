import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, getMembers } from '../lib/api'
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

function People() {
  const [members, setMembers] = useState<MemberSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    getMembers()
      .then((res) => setMembers(res.members))
      .catch((e: Error) => {
        setError(e instanceof ApiError && e.status === 401 ? 'Sign in to view the directory.' : e.message)
      })
  }, [])

  const sorted = useMemo(
    () => (members ? [...members].sort((a, b) => (a.name || '').localeCompare(b.name || '')) : null),
    [members],
  )
  const filtered = useMemo(() => {
    if (!sorted) return null
    const q = query.trim().toLowerCase()
    if (!q) return sorted
    return sorted.filter((m) => (m.name || 'member').toLowerCase().includes(q))
  }, [sorted, query])

  return (
    <main id="main-content" tabIndex={-1}>
      <div className="board legal-page">
        <div className="directory-head">
          <div>
            <h1>People</h1>
            <div className="directory-toggle">
              <span className="active">People</span>
              <Link to="/leaderboard">Leaderboard</Link>
            </div>
          </div>
          <input
            type="search"
            className="directory-search"
            placeholder="Search by name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search people by name"
          />
        </div>

        {error && <p className="placeholder-note">{error}</p>}
        {!error && !filtered && <p>Loading&hellip;</p>}
        {!error && filtered && filtered.length === 0 && (
          <p className="placeholder-note">No one matches that search.</p>
        )}
        {!error && filtered && filtered.length > 0 && (
          <ul className="directory-list">
            {filtered.map((m) => {
              const played = m.wins + m.losses
              return (
                <li key={m.id} className={played > 0 ? 'directory-row has-stats' : 'directory-row'}>
                  <Link to={`/members/${m.id}`}>
                    <span className="directory-avatar">{initials(m.name)}</span>
                    <span className="directory-name">{m.name || 'Member'}</span>
                    {played > 0 ? (
                      <span className="directory-stat">
                        {m.winPct.toFixed(3).replace(/^0/, '')} &middot; {m.wins}&ndash;{m.losses}
                      </span>
                    ) : (
                      <span className="directory-stat muted">No matches yet</span>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </main>
  )
}

export default People
