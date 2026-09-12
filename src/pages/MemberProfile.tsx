import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError, getMemberProfile } from '../lib/api'
import type { PublicMemberProfile } from '../types'

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
        <Link to="/members" className="member-back">
          &larr; Back to Members
        </Link>

        {error && <p className="placeholder-note">{error}</p>}
        {!error && !member && <p>Loading&hellip;</p>}
        {!error && member && (
          <>
            <h1>{member.name || 'Member'}</h1>
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
