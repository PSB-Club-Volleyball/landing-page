import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import ResultsTable from '../components/ResultsTable'
import { ApiError, getMemberProfile } from '../lib/api'
import { initials } from '../lib/initials'
import { STRIPE_LABELS, STRIPE_SKILLS, STRIPE_TRAITS, stripeCount } from '../lib/stripes'
import type { PublicMemberProfile } from '../types'

function MemberProfile() {
  const { id } = useParams<{ id: string }>()
  const [member, setMember] = useState<PublicMemberProfile | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // A stripe giver links to another /members/:id, which reuses this
    // component: clear the previous member and error, and drop a response
    // that lands after the id has already changed again.
    let cancelled = false
    setMember(null)
    setError(null)
    const memberId = Number(id)
    if (!Number.isInteger(memberId)) {
      setError('Member not found.')
      return
    }
    getMemberProfile(memberId)
      .then((res) => {
        if (!cancelled) setMember(res.member)
      })
      .catch((e: Error) => {
        if (cancelled) return
        if (e instanceof ApiError && e.status === 401) setError('Sign in to view member results.')
        else if (e instanceof ApiError && e.status === 404) setError('Member not found.')
        else setError(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  return (
    <main id="main-content" tabIndex={-1}>
      <div className="board legal-page">
        <Link to="/people" className="member-back">
          &larr; Back to People
        </Link>

        {error && <p className="placeholder-note">{error}</p>}
        {!error && !member && <p>Loading&hellip;</p>}
        {!error && member && (
          <>
            <div className="mp-hero">
              <span className="mp-avatar">{initials(member.name)}</span>
              <div>
                <h1 className="mp-name">{member.name || 'Member'}</h1>
                {(member.position || member.classYear || member.team) && (
                  <div className="mp-tags">
                    {member.position && <span className="mp-tag">{member.position}</span>}
                    {member.classYear && <span className="mp-tag">{member.classYear}</span>}
                    {member.team && <span className="mp-tag">{member.team}</span>}
                    {member.jerseyNumber !== null && <span className="mp-tag">#{member.jerseyNumber}</span>}
                  </div>
                )}
              </div>
            </div>

            {member.summary.wins + member.summary.losses > 0 && (
              <div className="mp-stats-row">
                <div className="mp-stat">
                  <b>
                    {member.summary.wins}&ndash;{member.summary.losses}
                  </b>
                  <span>Record</span>
                </div>
                <div className="mp-stat">
                  <b>{member.summary.winPct.toFixed(3).replace(/^0/, '')}</b>
                  <span>Win %</span>
                </div>
                <div className="mp-stat">
                  <b>
                    {member.summary.setsWon}&ndash;{member.summary.setsLost}
                  </b>
                  <span>Sets</span>
                </div>
                {member.summary.currentStreak >= 2 && (
                  <div className="mp-stat">
                    <b>{member.summary.currentStreak}W</b>
                    <span>Streak</span>
                  </div>
                )}
              </div>
            )}

            <MemberStripesSection stripes={member.stripes} />

            <h2>Results</h2>
            {member.results.length === 0 ? (
              <p className="placeholder-note">No results yet.</p>
            ) : (
              <ResultsTable results={member.results} />
            )}
          </>
        )}
      </div>
    </main>
  )
}

// Stripes earned from teammates. They can only be awarded on an event page
// right after the event, so the profile only displays them.
function MemberStripesSection({ stripes }: { stripes: PublicMemberProfile['stripes'] }) {
  const countOf = (skill: string) => {
    const row = stripes.counts.find((c) => c.skill === skill)
    if (!row) throw new Error(`Stripe counts missing ${skill}`)
    return row.count
  }
  const max = Math.max(1, ...STRIPE_SKILLS.map(countOf))
  const eventCount = new Set(stripes.awards.map((a) => a.event_id)).size

  return (
    // Without an "Awarded by" sidebar the stripes card takes the full row.
    <section
      className={stripes.awards.length > 0 ? 'mp-stripes' : 'mp-stripes is-solo'}
      aria-labelledby="mp-stripes-title"
    >
      <div className="mp-stripes-main">
        <div className="mp-stripes-head">
          <div>
            <h2 id="mp-stripes-title">Kudos</h2>
            <p className="muted-sub">
              {stripes.total > 0
                ? `${stripeCount(stripes.total)} from ${stripes.giver_count} ${stripes.giver_count === 1 ? 'teammate' : 'teammates'} across ${eventCount} ${eventCount === 1 ? 'event' : 'events'}`
                : 'No kudos yet.'}
            </p>
          </div>
          <p className="muted-sub mp-stripes-how">
            Earned at events: teammates give kudos within 12 hours of the final whistle.
          </p>
        </div>
        {stripes.total > 0 && (
          <>
            <ul className="mp-stripe-bars">
              {STRIPE_SKILLS.map((skill) => {
                const n = countOf(skill)
                return (
                  <li key={skill}>
                    <span className="mp-stripe-label">{STRIPE_LABELS[skill]}</span>
                    <span className="mp-stripe-track" aria-hidden="true">
                      <span className="mp-stripe-fill" style={{ width: `${(n / max) * 100}%` }} />
                    </span>
                    <span className="mp-stripe-n">{n}</span>
                  </li>
                )
              })}
            </ul>
            <div className="mp-stripe-traits">
              <span className="mp-stripe-traits-label">Character</span>
              {STRIPE_TRAITS.map((skill) => (
                <span key={skill} className="mp-stripe-trait">
                  {STRIPE_LABELS[skill]} &times;{countOf(skill)}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
      {stripes.awards.length > 0 && (
        <div className="mp-stripes-side">
          <h3>Awarded by</h3>
          <ul>
            {stripes.awards.slice(0, 5).map((a) => (
              <li key={`${a.event_id}:${a.giver_id ?? 'former'}`}>
                {a.giver_id === null ? (
                  <span className="mp-stripes-former">Former member</span>
                ) : (
                  <Link to={`/members/${a.giver_id}`}>{a.giver_name || 'Member'}</Link>
                )}
                <span className="muted-sub mp-stripes-award" title={a.event_title}>
                  {a.skills.map((s) => STRIPE_LABELS[s]).join(', ')} &middot; {a.event_title}
                </span>
              </li>
            ))}
          </ul>
          {stripes.awards.length > 5 && <p className="muted-sub">and {stripes.awards.length - 5} more</p>}
        </div>
      )}
    </section>
  )
}

export default MemberProfile
