import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, cancelSignup, getProfile, updateSkillLevel } from '../lib/api'
import { logout } from '../lib/adminApi'
import { formatEventDate } from '../lib/eventFormat'
import type { MyProfile, SkillLevel } from '../types'

const SKILL_LEVEL_LABELS: Record<SkillLevel, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  competitive: 'Competitive',
}

type Tab = 'info' | 'rsvps' | 'results'

function Profile() {
  const [profile, setProfile] = useState<MyProfile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [signedOut, setSignedOut] = useState(false)
  const [cancellingId, setCancellingId] = useState<number | null>(null)
  const [tab, setTab] = useState<Tab>('info')
  const [skillDraft, setSkillDraft] = useState<SkillLevel | ''>('')
  const [skillSaving, setSkillSaving] = useState(false)
  const [skillError, setSkillError] = useState<string | null>(null)

  function refresh() {
    getProfile()
      .then((res) => {
        setProfile(res.profile)
        setSkillDraft(res.profile.status.skillLevel ?? '')
      })
      .catch((e: Error) => {
        const unauthorized = e instanceof ApiError && e.status === 401
        setSignedOut(unauthorized)
        setError(unauthorized ? 'Sign in to view your profile.' : e.message)
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

  async function saveSkillLevel() {
    setSkillSaving(true)
    setSkillError(null)
    try {
      await updateSkillLevel(skillDraft || null)
      refresh()
    } catch (e) {
      setSkillError((e as Error).message)
    } finally {
      setSkillSaving(false)
    }
  }

  if (error) {
    return (
      <main id="main-content" tabIndex={-1}>
        <div className="board legal-page">
          <p className="placeholder-note">{error}</p>
          {!signedOut && (
            <button
              type="button"
              className="nav-signout"
              onClick={() => {
                logout().then(() => window.location.reload())
              }}
            >
              Sign out
            </button>
          )}
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

  const { account, status, club, upcomingRsvps, results } = profile
  const skillDirty = skillDraft !== (status.skillLevel ?? '')

  return (
    <main id="main-content" tabIndex={-1}>
      <div className="board legal-page">
        <div className="profile-header">
          <div>
            <h1>{account.name || account.email}</h1>
            <p className="admin-note">{account.email}</p>
          </div>
          <button
            type="button"
            className="nav-signout"
            onClick={() => {
              logout().then(() => window.location.reload())
            }}
          >
            Sign out
          </button>
        </div>

        <div className="profile-tabs" role="tablist" aria-label="Profile sections">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'info'}
            className={tab === 'info' ? 'profile-tab active' : 'profile-tab'}
            onClick={() => setTab('info')}
          >
            My Info
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'rsvps'}
            className={tab === 'rsvps' ? 'profile-tab active' : 'profile-tab'}
            onClick={() => setTab('rsvps')}
          >
            Upcoming RSVPs
            {upcomingRsvps.length > 0 && <span className="profile-tab-count">· {upcomingRsvps.length}</span>}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'results'}
            className={tab === 'results' ? 'profile-tab active' : 'profile-tab'}
            onClick={() => setTab('results')}
          >
            Results
          </button>
        </div>

        {tab === 'info' && (
          <div role="tabpanel">
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
                      <td>Dues</td>
                      <td>
                        <span className={club.duesPaidYear === new Date().getFullYear() ? 'waiver-chip' : 'waiver-chip no'}>
                          {club.duesPaidYear ? `Paid ${club.duesPaidYear}` : 'Not on file'}
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

            <h2>Account status</h2>
            <div className="data-table">
              <table>
                <tbody>
                  <tr>
                    <td>Waiver</td>
                    <td>
                      <span
                        className={status.waiverSignedYear === new Date().getFullYear() ? 'waiver-chip' : 'waiver-chip no'}
                      >
                        {status.waiverSignedYear ? `Signed ${status.waiverSignedYear}` : 'Not signed'}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td>RSVPs</td>
                    <td>
                      <span className={status.rsvpRestricted ? 'waiver-chip no' : 'waiver-chip'}>
                        {status.rsvpRestricted ? 'Restricted' : 'Unrestricted'}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h2>Skill level</h2>
            {status.skillLevelLocked ? (
              <div className="field-row">
                <select className="skill-select" disabled value={status.skillLevel ?? ''}>
                  <option value="">Not set</option>
                  {(Object.keys(SKILL_LEVEL_LABELS) as SkillLevel[]).map((level) => (
                    <option key={level} value={level}>
                      {SKILL_LEVEL_LABELS[level]}
                    </option>
                  ))}
                </select>
                <span className="locked-note">An admin has locked your skill level — contact the club to change it.</span>
              </div>
            ) : (
              <div className="field-row">
                <select
                  className="skill-select"
                  value={skillDraft}
                  onChange={(e) => setSkillDraft(e.target.value as SkillLevel | '')}
                >
                  <option value="">Not set</option>
                  {(Object.keys(SKILL_LEVEL_LABELS) as SkillLevel[]).map((level) => (
                    <option key={level} value={level}>
                      {SKILL_LEVEL_LABELS[level]}
                    </option>
                  ))}
                </select>
                <button type="button" disabled={!skillDirty || skillSaving} onClick={saveSkillLevel}>
                  {skillSaving ? 'Saving…' : 'Save'}
                </button>
                <span className="save-hint">Only you and club admins can see this.</span>
              </div>
            )}
            {skillError && <p className="admin-error">{skillError}</p>}
          </div>
        )}

        {tab === 'rsvps' && (
          <div role="tabpanel">
            <h2>Upcoming RSVPs</h2>
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
          </div>
        )}

        {tab === 'results' && (
          <div role="tabpanel">
            <h2>Results</h2>
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
            <p className="directory-link-row">
              See how everyone&rsquo;s doing &rarr; <Link to="/members">Members directory</Link>
            </p>
          </div>
        )}
      </div>
    </main>
  )
}

export default Profile
