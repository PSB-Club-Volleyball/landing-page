import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, cancelSignup, getProfile } from '../lib/api'
import { formatEventDate } from '../lib/eventFormat'
import type { MyProfile, SkillLevel } from '../types'

const SKILL_LEVEL_LABELS: Record<SkillLevel, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  competitive: 'Competitive',
}

function Profile() {
  const [profile, setProfile] = useState<MyProfile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cancellingId, setCancellingId] = useState<number | null>(null)

  function refresh() {
    getProfile()
      .then((res) => setProfile(res.profile))
      .catch((e: Error) => {
        setError(e instanceof ApiError && e.status === 401 ? 'Sign in to view your profile.' : e.message)
      })
  }

  useEffect(refresh, [])

  async function cancelRsvp(eventId: number, signupId: number, title: string) {
    if (!confirm(`Cancel your RSVP for ${title}?`)) return
    setCancellingId(signupId)
    try {
      await cancelSignup(eventId, signupId)
      refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setCancellingId(null)
    }
  }

  if (error) {
    return (
      <main id="main-content" tabIndex={-1}>
        <div className="board legal-page">
          <p className="placeholder-note">{error}</p>
        </div>
      </main>
    )
  }

  if (!profile) {
    return (
      <main id="main-content" tabIndex={-1}>
        <div className="board legal-page">
          <p>Loading&hellip;</p>
        </div>
      </main>
    )
  }

  const { account, club, upcomingRsvps, results } = profile

  return (
    <main id="main-content" tabIndex={-1}>
      <div className="board legal-page">
        <h1>{account.name || account.email}</h1>
        <p className="admin-note">{account.email}</p>

        <h2>Club details</h2>
        {club ? (
          <div className="data-table">
            <table>
              <tbody>
                <tr>
                  <td>Position</td>
                  <td>{club.position || '—'}</td>
                </tr>
                <tr>
                  <td>Team</td>
                  <td>{club.team || '—'}</td>
                </tr>
                <tr>
                  <td>Skill level</td>
                  <td>{club.skillLevel ? SKILL_LEVEL_LABELS[club.skillLevel] : 'Not yet assessed'}</td>
                </tr>
                <tr>
                  <td>Dues</td>
                  <td>
                    <span className={club.duesPaidYear === new Date().getFullYear() ? 'waiver-chip' : 'waiver-chip no'}>
                      {club.duesPaidYear ? `Paid ${club.duesPaidYear}` : 'Not on file'}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td>Waiver</td>
                  <td>
                    <span
                      className={club.waiverSignedYear === new Date().getFullYear() ? 'waiver-chip' : 'waiver-chip no'}
                    >
                      {club.waiverSignedYear ? `Signed ${club.waiverSignedYear}` : 'Not on file'}
                    </span>
                  </td>
                </tr>
                {club.roster && (
                  <tr>
                    <td>Roster</td>
                    <td>
                      {club.roster.season} roster
                      {club.roster.jerseyNumber !== null && ` · #${club.roster.jerseyNumber}`}
                      {club.roster.classYear && ` · ${club.roster.classYear}`}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="placeholder-note">
            Club details show up here once you&rsquo;re an approved club member — see the board for how to join.
          </p>
        )}

        <h2>My events</h2>
        <h3>Upcoming RSVPs</h3>
        {upcomingRsvps.length === 0 ? (
          <p className="placeholder-note">No upcoming RSVPs.</p>
        ) : (
          <ul className="profile-rsvp-list">
            {upcomingRsvps.map((r) => (
              <li key={r.signupId}>
                <span>
                  <Link to={`/events/${r.eventId}`}>{r.title}</Link> &mdash; {formatEventDate(r.startTime)}
                  {r.status === 'pending' && ' (pending approval)'}
                </span>
                <span className="row-actions">
                  <button
                    type="button"
                    disabled={cancellingId === r.signupId}
                    onClick={() => cancelRsvp(r.eventId, r.signupId, r.title)}
                  >
                    {cancellingId === r.signupId ? '…' : 'Cancel'}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        <h3>Results</h3>
        {results.length === 0 ? (
          <p className="placeholder-note">No results yet from events you&rsquo;ve played in.</p>
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
                {results.map((r) => (
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
      </div>
    </main>
  )
}

export default Profile
