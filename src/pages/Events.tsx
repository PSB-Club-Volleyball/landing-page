import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import SignupModal from '../components/SignupModal'
import { getEvents, getMe } from '../lib/api'
import {
  directionsUrl,
  EVENT_TYPE_LABELS,
  formatEventDate,
  formatSignupDeadline,
  formatTimeRange,
  getSignupState,
} from '../lib/eventFormat'
import { plainTextPreview } from '../lib/markdown'
import type { AuthUser, PublicClubEvent, SignupStatus } from '../types'

const DESCRIPTION_PREVIEW_LEN = 140

function EventCard({
  event,
  onOpenSignup,
  onManageSignup,
}: {
  event: PublicClubEvent
  onOpenSignup: (e: PublicClubEvent) => void
  onManageSignup: (e: PublicClubEvent, signupId: number, status: SignupStatus | null) => void
}) {
  const navigate = useNavigate()
  const detailHref = `/events/${event.id}`
  const { spotsLeft, isFull, joinsWaitlist, deadlinePassed, verb } = getSignupState(event)
  const tags = event.tags
    ? event.tags.split(',').map((t) => t.trim()).filter(Boolean)
    : []
  const preview = event.description ? plainTextPreview(event.description, DESCRIPTION_PREVIEW_LEN) : null

  // A guest (no account) signup isn't tracked here at all — nothing is kept
  // in the browser, so managing/cancelling it happens via the link emailed
  // at signup time. Only a logged-in account whose email matches gets the
  // "manage" button on the card.
  const mySignupId = event.my_signup_id
  const myStatus: SignupStatus | null = event.my_signup_status

  return (
    <div
      className={`event-card${event.status === 'cancelled' ? ' cancelled' : ''}`}
      // Mouse convenience only — the card is not a control. Keyboard and
      // assistive-tech users reach the same event page through the title
      // link below, so the inner buttons/links aren't nested in a widget.
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('a, button')) return
        navigate(detailHref)
      }}
    >
      <div className="event-card-row1">
        <Link to={detailHref} className="event-card-title">
          {event.title}
        </Link>
        <span className="event-card-type">{EVENT_TYPE_LABELS[event.event_type] ?? event.event_type}</span>
      </div>
      <div className="event-card-when">{formatTimeRange(event)}</div>
      {event.location_name && (
        <div className="event-card-where">
          {event.location_name}
          {event.location_address && (
            <>
              {' · '}
              <a
                href={directionsUrl(event.location_address)}
                target="_blank"
                rel="noreferrer"
                className="directions-link"
                onClick={(e) => e.stopPropagation()}
              >
                Directions
              </a>
            </>
          )}
        </div>
      )}
      {tags.length > 0 && (
        <div className="event-card-tags">
          {tags.map((t) => (
            <span className="tag-chip" key={t}>
              {t}
            </span>
          ))}
        </div>
      )}
      {event.status === 'cancelled' && <p className="event-card-desc">Cancelled</p>}
      {event.status !== 'cancelled' && preview && (
        <p className="event-card-desc">
          {preview.text}
          {preview.truncated && (
            <Link className="link-btn see-more-btn" to={detailHref} onClick={(e) => e.stopPropagation()}>
              Click to see more
            </Link>
          )}
        </p>
      )}

      {event.status !== 'cancelled' && event.signup_enabled && (
        <div className="event-card-signup">
          <span className="event-card-signup-status">
            <b>{event.signup_count}</b> {verb === 'RSVP' ? 'going' : 'signed up'}
            {spotsLeft !== null && !isFull && <span className="cap-chip">{spotsLeft} left</span>}
            {isFull && !joinsWaitlist && <span className="full-chip">full</span>}
            {joinsWaitlist && <span className="cap-chip">waitlist open</span>}
          </span>
          {mySignupId ? (
            <button
              className="btn btn-outline"
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onManageSignup(event, mySignupId, myStatus)
              }}
            >
              {myStatus === 'pending'
                ? 'Request pending · Manage'
                : myStatus === 'denied'
                  ? 'Not approved · Manage'
                  : myStatus === 'waitlist'
                    ? 'On waitlist · Manage'
                    : "You’re going · Manage"}
            </button>
          ) : (
            <button
              className={isFull && !joinsWaitlist ? 'btn btn-outline' : 'btn btn-ace'}
              type="button"
              disabled={deadlinePassed || (isFull && !joinsWaitlist)}
              onClick={(e) => {
                e.stopPropagation()
                onOpenSignup(event)
              }}
            >
              {deadlinePassed ? 'Deadline for registration passed' : joinsWaitlist ? 'Join waitlist' : isFull ? 'Full' : verb}
            </button>
          )}
        </div>
      )}
      {event.status !== 'cancelled' && event.signup_enabled && !mySignupId && !deadlinePassed && event.signup_deadline && (
        <p className="event-card-deadline">Signup closes {formatSignupDeadline(event.signup_deadline)}</p>
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
    status: SignupStatus | null
  } | null>(null)

  // Signed-in-only "Show past events": past events are excluded from the
  // main upcoming list entirely (server-side), so revealing them is a
  // separate fetch, made lazily the first time someone asks for it.
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined)
  const [pastEvents, setPastEvents] = useState<PublicClubEvent[] | null>(null)
  const [pastError, setPastError] = useState(false)
  const [pastLoading, setPastLoading] = useState(false)
  const [showPast, setShowPast] = useState(false)

  function refresh() {
    getEvents()
      .then((res) => setEvents(res.events))
      .catch(() => setError(true))
  }

  useEffect(refresh, [])
  useEffect(() => {
    getMe()
      .then((res) => setUser(res.user))
      .catch(() => setUser(null))
  }, [])

  function togglePast() {
    if (showPast) {
      setShowPast(false)
      return
    }
    setShowPast(true)
    if (pastEvents !== null || pastLoading) return
    setPastLoading(true)
    setPastError(false)
    getEvents({ past: true })
      .then((res) => setPastEvents(res.events))
      .catch(() => setPastError(true))
      .finally(() => setPastLoading(false))
  }

  const groups = new Map<string, PublicClubEvent[]>()
  for (const event of events ?? []) {
    const dayKey = event.start_time.slice(0, 10)
    if (!groups.has(dayKey)) groups.set(dayKey, [])
    groups.get(dayKey)!.push(event)
  }

  const pastGroups = new Map<string, PublicClubEvent[]>()
  for (const event of pastEvents ?? []) {
    const dayKey = event.start_time.slice(0, 10)
    if (!pastGroups.has(dayKey)) pastGroups.set(dayKey, [])
    pastGroups.get(dayKey)!.push(event)
  }

  return (
    <main id="main-content" tabIndex={-1}>
      <div className="board events-page">
        <h1>Events</h1>
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
                  {formatEventDate(`${dayKey}T00:00`)}{' '}
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
                      onManageSignup={(e, signupId, status) => setManage({ event: e, signupId, status })}
                    />
                  ))}
                </div>
              </div>
            ))}
          </>
        )}

        {user && (
          <div className="events-past-toggle">
            <button type="button" className="btn btn-outline btn-sm" onClick={togglePast}>
              {showPast ? 'Hide past events' : 'Show past events'}
            </button>
          </div>
        )}

        {user && showPast && (
          <div className="events-past-section">
            <h2 className="events-past-heading">Past events</h2>
            {pastLoading && <p className="placeholder-note">Loading past events&hellip;</p>}
            {pastError && <p className="placeholder-note">Couldn&rsquo;t load past events right now.</p>}
            {!pastLoading && !pastError && pastEvents !== null && pastEvents.length === 0 && (
              <p className="placeholder-note">No past events yet.</p>
            )}
            {!pastLoading &&
              !pastError &&
              [...pastGroups.entries()].map(([dayKey, dayEvents]) => (
                <div className="day-group" key={dayKey}>
                  <div className="day-label">
                    {formatEventDate(`${dayKey}T00:00`)}{' '}
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
                        onManageSignup={(e, signupId, status) => setManage({ event: e, signupId, status })}
                      />
                    ))}
                  </div>
                </div>
              ))}
          </div>
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
