import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ApiError, getMembers } from '../lib/api'
import { initials } from '../lib/initials'
import { MIN_RANKED_GAMES, wilsonLowerBound } from '../lib/ranking'
import { STRIPE_LABELS, STRIPE_SKILLS, STRIPE_TRAITS } from '../lib/stripes'
import type { MemberSummary } from '../types'

const STRIPE_LEADERS_PER_SKILL = 3

const pct = (m: MemberSummary) => m.winPct.toFixed(3).replace(/^0/, '')
const setDiff = (m: MemberSummary) => {
  const d = m.setsWon - m.setsLost
  return d > 0 ? `+${d}` : d < 0 ? `−${-d}` : '0'
}

// The Leaderboard is the competition: a dark scoreboard with the ranked
// record table, plus the top stripe earners per skill. Who someone is lives
// on People.
function Leaderboard() {
  const [members, setMembers] = useState<MemberSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [searchParams, setSearchParams] = useSearchParams()
  const view = searchParams.get('view') === 'stripes' ? 'stripes' : 'record'

  useEffect(() => {
    getMembers()
      .then((res) => setMembers(res.members))
      .catch((e: Error) => {
        setError(e instanceof ApiError && e.status === 401 ? 'Sign in to view the leaderboard.' : e.message)
      })
  }, [])

  const setView = (next: 'record' | 'stripes') =>
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        if (next === 'record') p.delete('view')
        else p.set('view', next)
        return p
      },
      { replace: true }
    )

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

  const stripeLeaders = useMemo(() => {
    if (!members) return null
    return [...STRIPE_SKILLS, ...STRIPE_TRAITS].map((skill) => ({
      skill,
      trait: STRIPE_TRAITS.includes(skill),
      top: members
        .filter((m) => (m.stripes[skill] ?? 0) > 0)
        .sort((a, b) => (b.stripes[skill] ?? 0) - (a.stripes[skill] ?? 0) || (a.name || '').localeCompare(b.name || ''))
        .slice(0, STRIPE_LEADERS_PER_SKILL),
    }))
  }, [members])

  const q = query.trim().toLowerCase()
  const matches = (m: MemberSummary) => !q || (m.name || 'member').toLowerCase().includes(q)
  // Search filters the table but never re-numbers it: rank is board position.
  const rows = ranked?.map((m, i) => ({ m, rank: i + 1 })).filter(({ m }) => matches(m)) ?? []
  const podium = !q && ranked ? ranked.slice(0, 3) : []
  const tableRows = q ? rows : rows.slice(3)
  const shownUnranked = unranked?.filter(matches) ?? []
  // Judged on the unfiltered lists, so a search never turns "no matches"
  // into "no results yet" (or shows both).
  const noResults = ranked !== null && unranked !== null && ranked.length === 0 && unranked.length === 0

  return (
    <main id="main-content" tabIndex={-1} className="lb-page">
      <div className="board">
        <div className="directory-head">
          <div>
            <h1>Leaderboard</h1>
            {members && (
              <p className="directory-count">
                {view === 'record'
                  ? `${ranked?.length ?? 0} ranked (${MIN_RANKED_GAMES}+ games) · ${unranked?.length ?? 0} not yet ranked · all-time`
                  : 'Most stripes per skill · awarded only by teammates, right after an event'}
              </p>
            )}
            <nav className="directory-toggle" aria-label="Community directory">
              <Link to="/people">People</Link>
              <span className="active" aria-current="page">Leaderboard</span>
            </nav>
          </div>
          <div className="lb-controls">
            <div className="lb-view" role="group" aria-label="Ranking">
              <button type="button" aria-pressed={view === 'record'} onClick={() => setView('record')}>
                Record
              </button>
              <button type="button" aria-pressed={view === 'stripes'} onClick={() => setView('stripes')}>
                Stripe leaders
              </button>
            </div>
            <input
              type="search"
              className={view === 'record' ? 'directory-search' : 'directory-search is-reserved'}
              placeholder="Search by name…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search leaderboard by name"
            />
          </div>
        </div>

        {error && <p className="placeholder-note">{error}</p>}
        {!error && !members && <p>Loading&hellip;</p>}

        {members && view === 'record' && (
          <>
            {noResults && (
              <p className="placeholder-note">No results yet — check back once matches have been played.</p>
            )}
            {!noResults && q && rows.length === 0 && shownUnranked.length === 0 && (
              <p className="placeholder-note">No one matches that search.</p>
            )}

            {podium.length > 0 && (
              <ol className="lb-podium">
                {podium.map((m, i) => (
                  <li key={m.id} className={`lb-podium-${i + 1}`}>
                    <Link to={`/members/${m.id}`}>
                      <span className="lb-podium-rank">
                        {['1st', '2nd', '3rd'][i]}
                        {m.currentStreak >= 2 && ` · ${m.currentStreak}W streak`}
                      </span>
                      <span className="lb-podium-name">{m.name || 'Member'}</span>
                      <span className="lb-podium-pct">
                        {pct(m)}{' '}
                        <span className="lb-podium-wl">
                          {m.wins}&ndash;{m.losses}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}

            {tableRows.length > 0 && (
              <div className="lb-table-wrap">
                <table className="lb-table">
                  <thead>
                    <tr>
                      <th scope="col">Rank</th>
                      <th scope="col">Player</th>
                      <th scope="col">W&ndash;L</th>
                      <th scope="col">Win %</th>
                      <th scope="col">Set diff</th>
                      <th scope="col">Streak</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map(({ m, rank }) => (
                      <tr key={m.id}>
                        <td className="lb-rank">{rank}</td>
                        <td>
                          <Link to={`/members/${m.id}`}>{m.name || 'Member'}</Link>
                        </td>
                        <td>
                          {m.wins}&ndash;{m.losses}
                        </td>
                        <td className="lb-pct">{pct(m)}</td>
                        <td>{setDiff(m)}</td>
                        <td className="lb-streak">{m.currentStreak >= 2 ? `${m.currentStreak}W` : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {ranked && ranked.length > 0 && (
              <p className="muted-sub lb-note">
                Ranked by win rate adjusted for games played (Wilson score), {MIN_RANKED_GAMES}+ games to qualify.
              </p>
            )}

            {shownUnranked.length > 0 && (
              <>
                <div className="section-label">
                  Not yet ranked <span className="count">{shownUnranked.length}</span>
                </div>
                <ul className="chip-flow">
                  {shownUnranked.map((m) => (
                    <li key={m.id}>
                      <Link to={`/members/${m.id}`} className="chip">
                        <span className="chip-avatar">{initials(m.name)}</span>
                        <span>
                          {m.name || 'Member'}{' '}
                          <span className="chip-record">
                            &middot; {m.wins}&ndash;{m.losses}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}

        {members && view === 'stripes' && stripeLeaders && (
          <ul className="lb-stripe-grid">
            {stripeLeaders.map(({ skill, trait, top }) => (
              <li key={skill} className={trait ? 'is-trait' : undefined}>
                <div className="lb-stripe-head">
                  <h2>{STRIPE_LABELS[skill]}</h2>
                  <span className="muted-sub">{trait ? 'Character' : 'Skill'}</span>
                </div>
                {top.length > 0 ? (
                  <ol>
                    {top.map((m) => (
                      <li key={m.id}>
                        <Link to={`/members/${m.id}`}>{m.name || 'Member'}</Link>
                        <span className="lb-stripe-n">{m.stripes[skill]}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="muted-sub">No stripes yet.</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}

export default Leaderboard
