import { useEffect, useState } from 'react'
import SignupModal from '../components/SignupModal'
import { getEvents } from '../lib/api'
import { getCancelToken } from '../lib/cancelTokens'
import type { PublicClubEvent, SignupStatus } from '../types'

const TYPE_LABELS: Record<string, string> = {
  practice: 'Practice',
  tournament: 'Tournament',
  open_gym: 'Open gym',
  game: 'Game',
  social: 'Social',
}

const dayHeaderFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
const timeFormatter = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' })

function formatTimeRange(event: PublicClubEvent) {
  const start = timeFormatter.format(new Date(event.start_time))
  if (!event.end_time) return start
  return `${start} – ${timeFormatter.format(new Date(event.end_time))}`
}

function EventCard({
  event,
  onOpenSignup,
  onManageSignup,
}: {
  event: PublicClubEvent
  onOpenSignup: (e: PublicClubEvent) => void
  onManageSignup: (e: PublicClubEvent, signupId: number, token: string | null, status: SignupStatus | null) => void
}) {
  const spotsLeft = event.capacity !== null ? event.capacity - event.signup_count : null
  const isFull = spotsLeft !== null && spotsLeft <= 0
  const verb = event.rsvp_gated
    ? 'Request'
    : event.event_type === 'game' || event.event_type === 'tournament'
      ? 'RSVP'
      : 'Sign up'

  const stored = getCancelToken(event.id)
  const mySignupId = event.my_signup_id ?? stored?.signupId ?? null
  const myToken = event.my_signup_id ? null : (stored?.token ?? null)
  // A stored (localStorage) signup with no matching my_signup_id means the
  // account/session view can't confirm its status — treat it as approved,
  // same as before gating existed.
  const myStatus: SignupStatus | null = event.my_signup_id ? event.my_signup_status : 'approved'

  return (
    <div className={`event-card${event.status === 'cancelled' ? ' cancelled' : ''}`}>
      <div className="event-card-row1">
        <p className="event-card-title">{event.title}</p>
        <span className="event-card-type">{TYPE_LABELS[event.event_type] ?? event.event_type}</span>
      </div>
      <div className="event-card-when">{formatTimeRange(event)}</div>
      {event.location_name && <div className="event-card-where">{event.location_name}</div>}
      {event.status === 'cancelled' && <p className="event-card-desc">Cancelled</p>}
      {event.status !== 'cancelled' && event.description && <p className="event-card-desc">{event.description}</p>}

      {event.status !== 'cancelled' && event.signup_enabled && (
        <div className="event-card-signup">
          <span className="event-card-signup-status">
            <b>{event.signup_count}</b> {verb === 'RSVP' ? 'going' : 'signed up'}
            {spotsLeft !== null && !isFull && <span className="cap-chip">{spotsLeft} left</span>}
            {isFull && <span className="full-chip">full</span>}
          </span>
          {mySignupId ? (
            <button
              className="btn btn-outline"
              type="button"
              onClick={() => onManageSignup(event, mySignupId, myToken, myStatus)}
            >
              {myStatus === 'pending'
                ? 'Request pending · Manage'
                : myStatus === 'denied'
                  ? 'Not approved · Manage'
                  : "You’re going · Manage"}
            </button>
          ) : (
            <button
              className={isFull ? 'btn btn-outline' : 'btn btn-ace'}
              type="button"
              disabled={isFull}
              onClick={() => onOpenSignup(event)}
            >
              {isFull ? 'Full' : verb}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function Events() {
  const [events, setEvents] = useState<PublicClubEvent[] | null>(null)
  const [error, setError] = useState(false)
  const [signupEvent, setSignupEvent] = useState<PublicClubEvent | null>(null)
  const [manage, setManage] = useState<{
    event: PublicClubEvent
    signupId: number
    token: string | null
    status: SignupStatus | null
  } | null>(null)

  function refresh() {
    getEvents()
      .then((res) => setEvents(res.events))
      .catch(() => setError(true))
  }

  useEffect(refresh, [])

  const groups = new Map<string, PublicClubEvent[]>()
  for (const event of events ?? []) {
    const dayKey = event.start_time.slice(0, 10)
    if (!groups.has(dayKey)) groups.set(dayKey, [])
    groups.get(dayKey)!.push(event)
  }

  return (
    <main>
      <div className="board events-page">
        <h2>Events</h2>
        {error && (
          <p className="placeholder-note">
            Couldn&rsquo;t load events right now &mdash; try refreshing, or check our GroupMe below.
          </p>
        )}
        {!error && events !== null && events.length === 0 && (
          <p className="placeholder-note">
            There are no practices right now while the board decides on tryouts. In the meantime,
            we&rsquo;re holding weekly open gyms &mdash; join our GroupMe below for times and
            details. Tournament dates will be posted here once the season is set.
          </p>
        )}
        {!error && events !== null && events.length > 0 && (
          <>
            <p className="events-page-note">RSVP or sign up below &mdash; no account needed.</p>

            {[...groups.entries()].map(([dayKey, dayEvents]) => (
              <div className="day-group" key={dayKey}>
                <div className="day-label">
                  {dayHeaderFormatter.format(new Date(`${dayKey}T00:00`))}{' '}
                  <span className="day-label-count">
                    {dayEvents.length} event{dayEvents.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="card-grid">
                  {dayEvents.map((event) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      onOpenSignup={setSignupEvent}
                      onManageSignup={(e, signupId, token, status) => setManage({ event: e, signupId, token, status })}
                    />
                  ))}
                </div>
              </div>
            ))}
          </>
        )}

        {signupEvent && (
          <SignupModal
            event={signupEvent}
            onClose={() => {
              setSignupEvent(null)
              refresh()
            }}
          />
        )}
        {manage && (
          <SignupModal
            event={manage.event}
            existingSignupId={manage.signupId}
            existingCancelToken={manage.token}
            existingSignupStatus={manage.status}
            onCancelled={refresh}
            onClose={() => {
              setManage(null)
              refresh()
            }}
          />
        )}
      </div>
    </main>
  )
}

export default Events
