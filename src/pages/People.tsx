import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, getMembers } from '../lib/api'
import { initials } from '../lib/initials'
import { STRIPE_LABELS } from '../lib/stripes'
import type { MemberSummary, StripeSkill } from '../types'

type Filter = { kind: 'everyone' } | { kind: 'shared' } | { kind: 'position'; position: string }

const MAX_POSITION_FILTERS = 5

// Top two stripes, most first, for the card.
function topStripes(m: MemberSummary): string[] {
  return (Object.entries(m.stripes) as [StripeSkill, number][])
    .sort((a, b) => b[1] - a[1] || STRIPE_LABELS[a[0]].localeCompare(STRIPE_LABELS[b[0]]))
    .slice(0, 2)
    .map(([skill, n]) => `${STRIPE_LABELS[skill]} ${n}`)
}

function meta(m: MemberSummary): string | null {
  const parts = [m.position, m.classYear].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : null
}

// The People directory is about who someone is — position, class year, the
// stripes teammates gave them, whether you've played together. Records and
// rankings live on the Leaderboard.
function People() {
  const [members, setMembers] = useState<MemberSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>({ kind: 'everyone' })

  useEffect(() => {
    getMembers()
      .then((res) => setMembers(res.members))
      .catch((e: Error) => {
        setError(e instanceof ApiError && e.status === 401 ? 'Sign in to view the directory.' : e.message)
      })
  }, [])

  // Position is free text, so the chips come from what's actually in use.
  const positions = useMemo(() => {
    if (!members) return []
    const counts = new Map<string, number>()
    for (const m of members) if (m.position) counts.set(m.position, (counts.get(m.position) ?? 0) + 1)
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, MAX_POSITION_FILTERS)
      .map(([p]) => p)
  }, [members])

  const groups = useMemo(() => {
    if (!members) return null
    const q = query.trim().toLowerCase()
    const shown = members
      .filter((m) =>
        filter.kind === 'shared' ? m.sharedEvents > 0 : filter.kind === 'position' ? m.position === filter.position : true
      )
      .filter((m) => !q || (m.name || 'member').toLowerCase().includes(q) || (m.position ?? '').toLowerCase().includes(q))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    const byLetter = new Map<string, MemberSummary[]>()
    for (const m of shown) {
      // Strip accents so "Émile" files under E, next to where localeCompare sorted it.
      const first = (m.name || '').trim().charAt(0).normalize('NFD').charAt(0).toUpperCase()
      const letter = /[A-Z]/.test(first) ? first : '#'
      byLetter.set(letter, [...(byLetter.get(letter) ?? []), m])
    }
    return [...byLetter.entries()]
  }, [members, query, filter])

  const filterButton = (label: string, f: Filter) => {
    const active =
      f.kind === filter.kind && (f.kind !== 'position' || (filter.kind === 'position' && filter.position === f.position))
    return (
      <button
        key={label}
        type="button"
        className={active ? 'people-filter active' : 'people-filter'}
        aria-pressed={active}
        onClick={() => setFilter(f)}
      >
        {label}
      </button>
    )
  }

  return (
    <main id="main-content" tabIndex={-1}>
      <div className="board people-page">
        <div className="directory-head">
          <div>
            <h1>People</h1>
            {members && (
              <p className="directory-count">
                {members.length} members &middot; who plays what, and where they&rsquo;ve earned their stripes
              </p>
            )}
            <nav className="directory-toggle" aria-label="Community directory">
              <span className="active" aria-current="page">People</span>
              <Link to="/leaderboard">Leaderboard</Link>
            </nav>
          </div>
          <input
            type="search"
            className="directory-search"
            placeholder="Search by name or position…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search people by name or position"
          />
        </div>

        {members && (
          <div className="people-filters" role="group" aria-label="Show">
            {filterButton('Everyone', { kind: 'everyone' })}
            {filterButton('Played with you', { kind: 'shared' })}
            {positions.map((p) => filterButton(p, { kind: 'position', position: p }))}
          </div>
        )}

        {error && <p className="placeholder-note">{error}</p>}
        {!error && !groups && <p>Loading&hellip;</p>}
        {!error && groups && groups.length === 0 && <p className="placeholder-note">No one matches.</p>}

        {groups?.map(([letter, people]) => (
          <section key={letter} aria-label={letter}>
            <div className="section-label">{letter}</div>
            <ul className="person-grid">
              {people.map((m) => {
                const stripes = topStripes(m)
                const line = meta(m)
                return (
                  <li key={m.id}>
                    <Link to={`/members/${m.id}`} className="person-card">
                      <span className="person-top">
                        <span className="person-avatar">{initials(m.name)}</span>
                        <span className="person-who">
                          <span className="person-name">{m.name || 'Member'}</span>
                          {line && <span className="person-meta">{line}</span>}
                        </span>
                      </span>
                      {stripes.length > 0 && (
                        <span className="person-stripes">
                          {stripes.map((s) => (
                            <span key={s} className="person-stripe">
                              {s}
                            </span>
                          ))}
                        </span>
                      )}
                      {m.sharedEvents > 0 && (
                        <span className="person-shared">
                          Played together at {m.sharedEvents} {m.sharedEvents === 1 ? 'event' : 'events'}
                        </span>
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </main>
  )
}

export default People
