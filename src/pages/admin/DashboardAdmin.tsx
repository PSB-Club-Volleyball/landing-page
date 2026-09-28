import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminApi } from '../../lib/adminApi'
import { formatEventDate, formatTimeRange, SKILL_LEVEL_LABELS } from '../../lib/eventFormat'
import type { AdminEventRow, AdminUser, EventSignup } from '../../types'
import type { TabIntent } from './AdminLayout'

const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'short' })
const dayFormatter = new Intl.DateTimeFormat('en-US', { day: 'numeric' })
const todayFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

type QueueFilter = 'all' | 'rsvp' | 'skill' | 'waitlist'
type QueueItem = { kind: 'rsvp' | 'waitlist'; signup: PendingSignup } | { kind: 'skill'; user: AdminUser }

const KIND_LABELS: Record<QueueItem['kind'], string> = { rsvp: 'RSVP', waitlist: 'Waitlist', skill: 'Skill' }
const QUEUE_SHOWN = 6

// One pending/waitlisted signup, carrying the event it belongs to — the
// per-event admin page only has its own event's signups, but the dashboard
// aggregates across every gated event at once.
interface PendingSignup extends EventSignup {
  event: AdminEventRow
}

function DashboardAdmin({
  onGoTo,
  onAttentionChange,
}: {
  onGoTo: (tab: 'events' | 'users' | 'media', intent?: TabIntent) => void
  // Feeds the sidebar's Dashboard badge.
  onAttentionChange: (count: number) => void
}) {
  const [events, setEvents] = useState<AdminEventRow[] | null>(null)
  const [pending, setPending] = useState<PendingSignup[] | null>(null)
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [filter, setFilter] = useState<QueueFilter>('all')
  const [showAll, setShowAll] = useState(false)

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

  const skillRequests = (users ?? []).filter((u) => u.skill_level_change_requested)
  const attention = pending && users ? pending.length + skillRequests.length : null
  useEffect(() => {
    if (attention !== null) onAttentionChange(attention)
  }, [attention, onAttentionChange])

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

  const actions = (
    <div className="admin-head-actions">
      <button type="button" className="btn btn-outline btn-sm" onClick={() => onGoTo('media')}>
        Upload media
      </button>
      <button type="button" className="add-btn" onClick={() => onGoTo('events', 'create')}>
        New event
      </button>
    </div>
  )
  const today = todayFormatter.format(new Date())

  if (!events || !users || !pending) {
    return (
      <>
        <div className="admin-main-head">
          <div>
            <h2>Dashboard</h2>
            <p className="admin-page-desc">{today}</p>
          </div>
          {actions}
        </div>
        {error ? <p className="admin-error">{error}</p> : <p className="admin-loading">Loading…</p>}
      </>
    )
  }

  const queue: QueueItem[] = [
    ...pending.map((signup) => ({ kind: signup.status === 'waitlist' ? ('waitlist' as const) : ('rsvp' as const), signup })),
    ...skillRequests.map((user) => ({ kind: 'skill' as const, user })),
  ]
  const counts = {
    all: queue.length,
    rsvp: queue.filter((q) => q.kind === 'rsvp').length,
    skill: queue.filter((q) => q.kind === 'skill').length,
    waitlist: queue.filter((q) => q.kind === 'waitlist').length,
  }
  // A kind whose last item was just handled loses its chip, so fall back to
  // All rather than leave the list stuck on an empty filter.
  const activeFilter: QueueFilter = filter === 'all' || counts[filter] > 0 ? filter : 'all'
  const filtered = activeFilter === 'all' ? queue : queue.filter((q) => q.kind === activeFilter)
  const shown = showAll ? filtered : filtered.slice(0, QUEUE_SHOWN)

  const now = Date.now()
  const upcoming = events
    .filter((e) => e.status === 'published' && !e.is_past && new Date(e.start_time).getTime() >= now)
    .sort((a, b) => a.start_time.localeCompare(b.start_time))
    .slice(0, 5)

  // UTC, matching the server's getUTCFullYear() when it stamps the year.
  const year = new Date().getUTCFullYear()
  const waiverMissing = users.filter((u) => u.waiver_signed_year !== year).length
  const duesUnpaid = users.filter(
    (u) => (u.role === 'club_member' || u.role === 'admin') && u.dues_paid_year !== year,
  ).length

  const filters: { key: QueueFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'rsvp', label: 'RSVPs' },
    { key: 'skill', label: 'Skill' },
    { key: 'waitlist', label: 'Waitlist' },
  ]

  return (
    <>
      <div className="admin-main-head">
        <div>
          <h2>Dashboard</h2>
          <p className="admin-page-desc">
            {today}.{' '}
            {queue.length === 0
              ? 'Nothing needs you right now.'
              : `${queue.length} thing${queue.length === 1 ? '' : 's'} need${queue.length === 1 ? 's' : ''} you.`}
          </p>
        </div>
        {actions}
      </div>

      {error && <p className="admin-error">{error}</p>}

      <div className="dash-layout">
        <section className="dash-panel">
          <div className="dash-panel-head">
            <h3>Needs you</h3>
            {queue.length > 0 && (
              <div className="dash-filters" role="group" aria-label="Show">
                {filters
                  .filter((f) => f.key === 'all' || counts[f.key] > 0)
                  .map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      aria-pressed={activeFilter === f.key}
                      className={activeFilter === f.key ? 'active' : undefined}
                      onClick={() => {
                        setFilter(f.key)
                        setShowAll(false)
                      }}
                    >
                      {f.label} {counts[f.key]}
                    </button>
                  ))}
              </div>
            )}
          </div>
          <div className="dash-panel-body">
            {filtered.length === 0 && <p className="dash-empty">You&rsquo;re all caught up.</p>}
            {shown.map((item) =>
              item.kind === 'skill' ? (
                <div className="dash-row" key={`user:${item.user.id}`}>
                  <span className="dash-kind kind-skill">{KIND_LABELS.skill}</span>
                  <div className="dash-row-main">
                    <span className="dash-row-title">{item.user.name || item.user.email}</span>
                    <span className="dash-row-sub">
                      {item.user.skill_level ? SKILL_LEVEL_LABELS[item.user.skill_level] : 'Unset'} to{' '}
                      {SKILL_LEVEL_LABELS[item.user.skill_level_change_requested!]}
                    </span>
                  </div>
                  <div className="row-actions dash-row-actions">
                    <button
                      type="button"
                      className="primary"
                      disabled={busy === `user:${item.user.id}`}
                      onClick={() => approveSkillRequest(item.user)}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={busy === `user:${item.user.id}`}
                      onClick={() => dismissSkillRequest(item.user)}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ) : (
                <div className="dash-row" key={`signup:${item.signup.id}`}>
                  <span className={`dash-kind kind-${item.kind}`}>{KIND_LABELS[item.kind]}</span>
                  <div className="dash-row-main">
                    <span className="dash-row-title">{item.signup.name}</span>
                    <span className="dash-row-sub">
                      <Link to={`/admin/events/${item.signup.event.id}?tab=signups`}>{item.signup.event.title}</Link>{' '}
                      &middot; {formatEventDate(item.signup.event.start_time)}
                    </span>
                  </div>
                  <div className="row-actions dash-row-actions">
                    <button
                      type="button"
                      className="primary"
                      disabled={busy === `signup:${item.signup.id}`}
                      onClick={() => decide(item.signup, 'approved')}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="danger"
                      disabled={busy === `signup:${item.signup.id}`}
                      onClick={() => decide(item.signup, 'denied')}
                    >
                      Deny
                    </button>
                  </div>
                </div>
              ),
            )}
            {filtered.length > QUEUE_SHOWN && (
              <button type="button" className="dash-more" onClick={() => setShowAll((v) => !v)}>
                {showAll ? 'Show fewer' : `Show ${filtered.length - QUEUE_SHOWN} more`}
              </button>
            )}
          </div>
        </section>

        <div className="dash-side">
          <section className="dash-panel">
            <div className="dash-panel-head">
              <h3>Coming up</h3>
              <button type="button" className="link-btn" onClick={() => onGoTo('events')}>
                All events
              </button>
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
                      <span className="dash-event-sub">{formatTimeRange(event)}</span>
                      {event.capacity !== null && event.capacity > 0 ? (
                        <span className="dash-fill">
                          <span className="dash-fill-track" aria-hidden="true">
                            <span
                              className={full ? 'dash-fill-bar full' : 'dash-fill-bar'}
                              style={{ width: `${Math.min(100, (100 * event.signup_count) / event.capacity)}%` }}
                            />
                          </span>
                          <span className={full ? 'cap-chip full' : 'cap-chip'}>
                            {event.signup_count}/{event.capacity}
                          </span>
                        </span>
                      ) : (
                        event.signup_enabled && <span className="cap-chip">{event.signup_count} signed up</span>
                      )}
                    </div>
                  </Link>
                )
              })}
            </div>
          </section>

          <section className="dash-panel">
            <div className="dash-panel-head">
              <h3>Paperwork ({year})</h3>
            </div>
            <div className="dash-panel-body">
              <button type="button" className="dash-count-row" onClick={() => onGoTo('users', 'waiver-missing')}>
                <span>Waiver missing</span>
                <b>{waiverMissing}</b>
              </button>
              <button type="button" className="dash-count-row" onClick={() => onGoTo('users', 'dues-unpaid')}>
                <span>Dues unpaid</span>
                <b>{duesUnpaid}</b>
              </button>
            </div>
          </section>
        </div>
      </div>
    </>
  )
}

export default DashboardAdmin
