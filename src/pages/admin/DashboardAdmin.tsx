import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminApi } from '../../lib/adminApi'
import { formatEventDate, formatTimeRange, SKILL_LEVEL_LABELS } from '../../lib/eventFormat'
import type { AdminEventRow, AdminUser, EventSignup } from '../../types'

const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'short' })
const dayFormatter = new Intl.DateTimeFormat('en-US', { day: 'numeric' })

// One pending/waitlisted signup, carrying the event it belongs to — the
// per-event admin page only has its own event's signups, but the dashboard
// aggregates across every gated event at once.
interface PendingSignup extends EventSignup {
  event: AdminEventRow
}

function DashboardAdmin({ onGoTo }: { onGoTo: (tab: 'events' | 'users') => void }) {
  const [events, setEvents] = useState<AdminEventRow[] | null>(null)
  const [pending, setPending] = useState<PendingSignup[] | null>(null)
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  async function load() {
    setError('')
    try {
      const [{ events: allEvents }, { users: allUsers }] = await Promise.all([
        adminApi.events.list(),
        adminApi.users.list(),
      ])
      setEvents(allEvents)
      setUsers(allUsers)

      const gated = allEvents.filter((e) => e.rsvp_gated && e.status !== 'cancelled' && !e.is_past)
      const signupLists = await Promise.all(gated.map((e) => adminApi.events.signups(e.id)))
      const flat: PendingSignup[] = []
      gated.forEach((event, i) => {
        for (const signup of signupLists[i].signups) {
          if (signup.status === 'pending' || signup.status === 'waitlist') flat.push({ ...signup, event })
        }
      })
      flat.sort((a, b) => a.created_at.localeCompare(b.created_at))
      setPending(flat)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function decide(signup: PendingSignup, status: 'approved' | 'denied') {
    setBusy(`signup:${signup.id}`)
    try {
      await adminApi.events.decideSignup(signup.event.id, signup.id, status)
      setPending((prev) => (prev ?? []).filter((s) => s.id !== signup.id))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function dismissSkillRequest(user: AdminUser) {
    setBusy(`user:${user.id}`)
    try {
      await adminApi.users.update(user.id, { skill_level_change_requested: null })
      setUsers((prev) => (prev ?? []).map((u) => (u.id === user.id ? { ...u, skill_level_change_requested: null } : u)))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function approveSkillRequest(user: AdminUser) {
    if (!user.skill_level_change_requested) return
    setBusy(`user:${user.id}`)
    try {
      await adminApi.users.update(user.id, {
        skill_level: user.skill_level_change_requested,
        skill_level_change_requested: null,
      })
      setUsers((prev) =>
        (prev ?? []).map((u) =>
          u.id === user.id ? { ...u, skill_level: user.skill_level_change_requested, skill_level_change_requested: null } : u,
        ),
      )
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  if (!events || !users || !pending) {
    return (
      <>
        <div className="admin-main-head">
          <div>
            <h2>Dashboard</h2>
            <p className="admin-note">What needs attention, and what's coming up.</p>
          </div>
        </div>
        {error ? <p className="admin-error">{error}</p> : <p className="admin-loading">Loading…</p>}
      </>
    )
  }

  const skillRequests = users.filter((u) => u.skill_level_change_requested)
  const waitlistCount = pending.filter((s) => s.status === 'waitlist').length
  const pendingCount = pending.length - waitlistCount

  const now = Date.now()
  const upcoming = events
    .filter((e) => e.status === 'published' && !e.is_past && new Date(e.start_time).getTime() >= now)
    .sort((a, b) => a.start_time.localeCompare(b.start_time))
    .slice(0, 6)

  const PENDING_SHOWN = 4
  const SKILL_SHOWN = 4

  return (
    <>
      <div className="admin-main-head">
        <div>
          <h2>Dashboard</h2>
          <p className="admin-note">What needs attention, and what's coming up.</p>
        </div>
      </div>

      {error && <p className="admin-error">{error}</p>}

      <div className="dash-stats">
        <div className={pendingCount > 0 ? 'dash-stat attn' : 'dash-stat'}>
          <span className="dash-stat-num">{pendingCount}</span>
          <span className="dash-stat-label">Pending RSVPs</span>
        </div>
        <div className={waitlistCount > 0 ? 'dash-stat attn' : 'dash-stat'}>
          <span className="dash-stat-num">{waitlistCount}</span>
          <span className="dash-stat-label">Waitlisted</span>
        </div>
        <div className={skillRequests.length > 0 ? 'dash-stat attn' : 'dash-stat'}>
          <span className="dash-stat-num">{skillRequests.length}</span>
          <span className="dash-stat-label">Skill requests</span>
        </div>
        <div className="dash-stat">
          <span className="dash-stat-num">{upcoming.length}</span>
          <span className="dash-stat-label">Upcoming events</span>
        </div>
      </div>

      <div className="dash-grid cols-2">
        <div className="dash-panel">
          <div className="dash-panel-head">
            <h3>Pending RSVPs</h3>
            <span className={pending.length > 0 ? 'dash-panel-count' : 'dash-panel-count zero'}>{pending.length}</span>
          </div>
          <div className="dash-panel-body">
            {pending.length === 0 && <p className="dash-empty">Nothing pending.</p>}
            {pending.slice(0, PENDING_SHOWN).map((signup) => (
              <div className="dash-row" key={signup.id}>
                <div className="dash-row-main">
                  <span className="dash-row-title">{signup.name}</span>
                  <span className="dash-row-sub">
                    {signup.event.title} &middot; {formatEventDate(signup.event.start_time)}
                  </span>
                </div>
                <span className={`status-chip status-${signup.status}`}>
                  {signup.status === 'waitlist' ? 'Waitlist' : 'Pending'}
                </span>
                <div className="row-actions dash-row-actions">
                  <button type="button" className="primary" disabled={busy === `signup:${signup.id}`} onClick={() => decide(signup, 'approved')}>
                    Approve
                  </button>
                  <button type="button" className="danger" disabled={busy === `signup:${signup.id}`} onClick={() => decide(signup, 'denied')}>
                    Deny
                  </button>
                </div>
              </div>
            ))}
            {pending.length > PENDING_SHOWN && (
              <div className="dash-row">
                <div className="dash-row-main">
                  <span className="dash-row-title">
                    +{pending.length - PENDING_SHOWN} more across{' '}
                    {new Set(pending.slice(PENDING_SHOWN).map((s) => s.event.id)).size} event(s)
                  </span>
                </div>
                <div className="row-actions dash-row-actions">
                  <button type="button" className="link-btn" onClick={() => onGoTo('events')}>
                    View all →
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="dash-panel">
          <div className="dash-panel-head">
            <h3>Skill level change requests</h3>
            <span className={skillRequests.length > 0 ? 'dash-panel-count' : 'dash-panel-count zero'}>
              {skillRequests.length}
            </span>
          </div>
          <div className="dash-panel-body">
            {skillRequests.length === 0 && <p className="dash-empty">Nothing pending.</p>}
            {skillRequests.slice(0, SKILL_SHOWN).map((user) => (
              <div className="dash-row" key={user.id}>
                <div className="dash-row-main">
                  <span className="dash-row-title">{user.name || user.email}</span>
                  <span className="dash-row-sub">
                    {user.skill_level ? SKILL_LEVEL_LABELS[user.skill_level] : 'Unset'} →{' '}
                    {SKILL_LEVEL_LABELS[user.skill_level_change_requested!]}
                  </span>
                </div>
                <div className="row-actions dash-row-actions">
                  <button type="button" className="primary" disabled={busy === `user:${user.id}`} onClick={() => approveSkillRequest(user)}>
                    Approve
                  </button>
                  <button type="button" disabled={busy === `user:${user.id}`} onClick={() => dismissSkillRequest(user)}>
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
            {skillRequests.length > SKILL_SHOWN && (
              <div className="dash-row">
                <div className="dash-row-main">
                  <span className="dash-row-title">+{skillRequests.length - SKILL_SHOWN} more</span>
                </div>
                <div className="row-actions dash-row-actions">
                  <button type="button" className="link-btn" onClick={() => onGoTo('users')}>
                    View in Users →
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="dash-panel">
        <div className="dash-panel-head">
          <h3>Upcoming events</h3>
          <span className="dash-panel-count zero">{upcoming.length}</span>
        </div>
        <div className="dash-panel-body">
          {upcoming.length === 0 && <p className="dash-empty">No upcoming events.</p>}
          {upcoming.map((event) => {
            const full = event.capacity !== null && event.signup_count >= event.capacity
            return (
              <Link className="dash-event-row" to={`/admin/events/${event.id}`} key={event.id}>
                <div className="dash-event-date">
                  <span className="mon">{monthFormatter.format(new Date(event.start_time))}</span>
                  <span className="day">{dayFormatter.format(new Date(event.start_time))}</span>
                </div>
                <div className="dash-event-main">
                  <span className="dash-event-title">{event.title}</span>
                  <span className="dash-event-sub">
                    {formatTimeRange(event)}
                    {event.location_name ? ` · ${event.location_name}` : ''}
                  </span>
                </div>
                <div className="dash-event-meta">
                  <span className={full ? 'cap-chip full' : 'cap-chip'}>
                    {event.capacity !== null ? `${event.signup_count} / ${event.capacity}` : '—'}
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </>
  )
}

export default DashboardAdmin
