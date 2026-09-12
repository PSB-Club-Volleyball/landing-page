import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError, getMemberProfile } from '../lib/api'
import type { PublicMemberProfile } from '../types'

function initials(name: string | null) {
  const source = name || '?'
  return source
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function MemberProfile() {
  const { id } = useParams<{ id: string }>()
  const [member, setMember] = useState<PublicMemberProfile | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const memberId = Number(id)
    if (!Number.isInteger(memberId)) {
      setError('Member not found.')
      return
    }
    getMemberProfile(memberId)
      .then((res) => setMember(res.member))
      .catch((e: Error) => {
        if (e instanceof ApiError && e.status === 401) setError('Sign in to view member results.')
        else if (e instanceof ApiError && e.status === 404) setError('Member not found.')
        else setError(e.message)
      })
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
                    {member.position && <span className="mp-tag gold">{member.position}</span>}
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

            <h2>Results</h2>
            {member.results.length === 0 ? (
              <p className="placeholder-note">No results yet.</p>
            ) : (
              <div className="data-table public-standings">
                <table>
                  <thead>
                    <tr>
                      <th>Event</th>
                      <th>Team</th>
                      <th>W</th>
                      <th>L</th>
                      <th>Sets</th>
                    </tr>
                  </thead>
                  <tbody>
                    {member.results.map((r) => (
                      <tr key={r.eventId}>
                        <td>
                          <Link to={`/events/${r.eventId}`}>{r.title}</Link>
                        </td>
                        <td>{r.teamName}</td>
                        <td>{r.wins}</td>
                        <td>{r.losses}</td>
                        <td>
                          {r.setsWon}&ndash;{r.setsLost}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  )
}

export default MemberProfile
