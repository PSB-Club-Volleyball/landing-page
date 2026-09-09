import { useEffect, useState } from 'react'
import { adminApi } from '../../lib/adminApi'
import { downloadCsv, toCsv } from '../../lib/csv'
import type { EventSignup } from '../../types'

function exportSignupsCsv(eventTitle: string, signups: EventSignup[]) {
  const csv = toCsv(
    ['Name', 'Email', 'Answers', 'Status', 'Checked in', 'Submitted'],
    signups.map((s) => [
      s.name,
      s.email,
      s.answers ? Object.values(s.answers).filter(Boolean).join('; ') : '',
      s.status,
      s.checked_in_at ? new Date(s.checked_in_at).toLocaleString() : '',
      new Date(s.created_at).toLocaleString(),
    ])
  )
  const safeTitle = eventTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  downloadCsv(`${safeTitle || 'event'}-signups.csv`, csv)
}

// The attendee roster for one event: approve / deny / waitlist / promote /
// check-in / remove, plus CSV export, "release pending", and an email
// announcement composer. Rendered on the admin event page's Signups tab.
export default function SignupsPanel({
  eventId,
  eventTitle,
  onChanged,
}: {
  eventId: number
  eventTitle: string
  onChanged: () => void
}) {
  const [signups, setSignups] = useState<EventSignup[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [releasing, setReleasing] = useState(false)
  const [announceOpen, setAnnounceOpen] = useState(false)
  const [announceSubject, setAnnounceSubject] = useState('')
  const [announceMessage, setAnnounceMessage] = useState('')
  const [announcing, setAnnouncing] = useState(false)
  const [announceNote, setAnnounceNote] = useState<string | null>(null)

  function refresh() {
    adminApi.events
      .signups(eventId)
      .then((res) => setSignups(res.signups))
      .catch((e: Error) => setError(e.message))
  }

  useEffect(refresh, [eventId])

  async function handleRemove(signupId: number) {
    if (!confirm('Remove this person from the signup list?')) return
    try {
      await adminApi.events.removeSignup(eventId, signupId)
      refresh()
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function handleDecide(signupId: number, status: 'approved' | 'denied' | 'waitlist') {
    try {
      await adminApi.events.decideSignup(eventId, signupId, status)
      refresh()
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function handleToggleCheckedIn(signupId: number, checkedIn: boolean) {
    try {
      await adminApi.events.setCheckedIn(eventId, signupId, checkedIn)
      refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function handleRelease() {
    if (!confirm(`Release all pending requests for ${eventTitle}? Anyone who fits will be approved; the rest go to the waitlist.`)) return
    setReleasing(true)
    try {
      const res = await adminApi.events.release(eventId)
      setAnnounceNote(`Released: ${res.approved} approved, ${res.waitlisted} waitlisted.`)
      refresh()
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setReleasing(false)
    }
  }

  async function handleAnnounce(ev: React.FormEvent) {
    ev.preventDefault()
    setAnnouncing(true)
    setAnnounceNote(null)
    try {
      const res = await adminApi.events.announce(eventId, { subject: announceSubject, message: announceMessage })
      setAnnounceNote(`Emailed ${res.recipient_count} ${res.recipient_count === 1 ? 'person' : 'people'}.`)
      setAnnounceSubject('')
      setAnnounceMessage('')
      setAnnounceOpen(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setAnnouncing(false)
    }
  }

  if (error) return <p className="admin-error">{error}</p>
  if (!signups) return <p className="admin-note">Loading&hellip;</p>

  const pendingCount = signups.filter((s) => s.status === 'pending').length

  return (
    <>
      <div className="signups-panel-actions">
        <button
          className="btn btn-outline btn-sm"
          type="button"
          disabled={signups.length === 0}
          onClick={() => exportSignupsCsv(eventTitle, signups)}
        >
          Download CSV
        </button>
        <button className="btn btn-outline btn-sm" type="button" disabled={pendingCount === 0 || releasing} onClick={handleRelease}>
          {releasing ? 'Releasing…' : `Release ${pendingCount} pending`}
        </button>
        <button
          className="btn btn-outline btn-sm"
          type="button"
          disabled={signups.length === 0}
          onClick={() => setAnnounceOpen((v) => !v)}
        >
          Email announcement
        </button>
      </div>
      {announceNote && <p className="admin-note">{announceNote}</p>}
      {announceOpen && (
        <form className="announce-form" onSubmit={handleAnnounce}>
          <label className="field">
            Subject
            <input required value={announceSubject} onChange={(e) => setAnnounceSubject(e.target.value)} />
          </label>
          <label className="field">
            Message
            <textarea
              required
              rows={4}
              value={announceMessage}
              onChange={(e) => setAnnounceMessage(e.target.value)}
            />
          </label>
          <p className="field-hint">Emails everyone signed up for this event (approved, waitlisted, and pending).</p>
          <div className="form-actions">
            <button className="btn btn-outline" type="button" onClick={() => setAnnounceOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-ace" type="submit" disabled={announcing}>
              {announcing ? 'Sending…' : 'Send'}
            </button>
          </div>
        </form>
      )}
      {signups.length === 0 ? (
        <p className="admin-note">No one has signed up yet.</p>
      ) : (
      <table className="signups-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Email</th>
          <th>Answers</th>
          <th>Status</th>
          <th>Checked in</th>
          <th>Submitted</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {signups.map((s) => (
          <tr key={s.id}>
            <td>{s.name}</td>
            <td>{s.email}</td>
            <td>
              {s.answers
                ? Object.values(s.answers).filter(Boolean).join(', ') || '—'
                : '—'}
            </td>
            <td>
              <span className={`status-chip status-${s.status}`}>{s.status}</span>
            </td>
            <td>
              {s.status === 'approved' && (
                <button
                  type="button"
                  className={s.checked_in_at ? 'signups-toggle checked-in' : 'signups-toggle'}
                  onClick={() => handleToggleCheckedIn(s.id, !s.checked_in_at)}
                >
                  {s.checked_in_at ? `✓ ${new Date(s.checked_in_at).toLocaleTimeString()}` : 'Check in'}
                </button>
              )}
            </td>
            <td>{new Date(s.created_at).toLocaleDateString()}</td>
            <td>
              <span className="row-actions">
                {s.status === 'pending' && (
                  <>
                    <button type="button" onClick={() => handleDecide(s.id, 'approved')}>
                      Approve
                    </button>
                    <button type="button" className="danger" onClick={() => handleDecide(s.id, 'denied')}>
                      Deny
                    </button>
                  </>
                )}
                {s.status === 'waitlist' && (
                  <button type="button" onClick={() => handleDecide(s.id, 'approved')}>
                    Promote
                  </button>
                )}
                {s.status === 'approved' && (
                  <button type="button" onClick={() => handleDecide(s.id, 'waitlist')}>
                    Move to waitlist
                  </button>
                )}
                <button type="button" className="danger" onClick={() => handleRemove(s.id)}>
                  Remove
                </button>
              </span>
            </td>
          </tr>
        ))}
      </tbody>
      </table>
      )}
    </>
  )
}
