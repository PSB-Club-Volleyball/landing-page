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

  const withRecord = useMemo(
    () =>
      filtered
        ?.filter((m) => m.wins + m.losses > 0)
        .sort((a, b) => b.winPct - a.winPct) ?? null,
    [filtered],
  )
  const withoutRecord = useMemo(() => filtered?.filter((m) => m.wins + m.losses === 0) ?? null, [filtered])

  return (
    <main id="main-content" tabIndex={-1}>
      <div className="board legal-page">
        <div className="directory-head">
          <div>
            <h1>People</h1>
            {members && (
              <p className="directory-count">
                {members.length} members &middot; {members.filter((m) => m.wins + m.losses > 0).length} with a match
                on record
              </p>
            )}
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

        {!error && withRecord && withRecord.length > 0 && (
          <>
            <div className="section-label">
              On the record <span className="count">{withRecord.length}</span>
            </div>
            <ul className="stat-grid">
              {withRecord.map((m) => (
                <li key={m.id}>
                  <Link to={`/members/${m.id}`} className="stat-card">
                    <span className="stat-avatar">{initials(m.name)}</span>
                    <span className="stat-who">
                      <span className="stat-name">{m.name || 'Member'}</span>
                      <span className="stat-rec">
                        {m.wins}&ndash;{m.losses}
                      </span>
                    </span>
                    <span className="stat-pct">{m.winPct.toFixed(3).replace(/^0/, '')}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}

        {!error && withoutRecord && withoutRecord.length > 0 && (
          <>
            <div className="section-label">
              No matches yet <span className="count">{withoutRecord.length}</span>
            </div>
            <ul className="chip-flow">
              {withoutRecord.map((m) => (
                <li key={m.id}>
                  <Link to={`/members/${m.id}`} className="chip">
                    <span className="chip-avatar">{initials(m.name)}</span>
                    {m.name || 'Member'}
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

export default People
