import { useEffect, useState } from 'react'
import EventDetailModal from '../components/EventDetailModal'
import SignupModal from '../components/SignupModal'
import { getEvents } from '../lib/api'
import { directionsUrl, EVENT_TYPE_LABELS, formatEventDate, formatTimeRange, getSignupState } from '../lib/eventFormat'
import { plainTextPreview } from '../lib/markdown'
import type { PublicClubEvent, SignupStatus } from '../types'

const DESCRIPTION_PREVIEW_LEN = 140

function EventCard({
  event,
  onOpenDetail,
  onOpenSignup,
  onManageSignup,
}: {
  event: PublicClubEvent
  onOpenDetail: (e: PublicClubEvent) => void
  onOpenSignup: (e: PublicClubEvent) => void
  onManageSignup: (e: PublicClubEvent, signupId: number, status: SignupStatus | null) => void
}) {
  const { spotsLeft, isFull, joinsWaitlist, verb } = getSignupState(event)
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
      // assistive-tech users reach the same detail view through the title
      // button below, so the inner buttons/links aren't nested in a widget.
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('a, button')) return
        onOpenDetail(event)
      }}
    >
      <div className="event-card-row1">
        <button
          type="button"
          className="event-card-title"
          onClick={() => onOpenDetail(event)}
        >
          {event.title}
        </button>
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
            <button
              className="link-btn see-more-btn"
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onOpenDetail(event)
              }}
            >
              Click to see more
            </button>
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
              disabled={isFull && !joinsWaitlist}
              onClick={(e) => {
                e.stopPropagation()
                onOpenSignup(event)
              }}
            >
              {joinsWaitlist ? 'Join waitlist' : isFull ? 'Full' : verb}
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
  const [detailEvent, setDetailEvent] = useState<PublicClubEvent | null>(null)
  const [signupEvent, setSignupEvent] = useState<PublicClubEvent | null>(null)
  const [manage, setManage] = useState<{
    event: PublicClubEvent
    signupId: number
    status: SignupStatus | null
  } | null>(null)

  function refresh() {
    getEvents()
      .then((res) => setEvents(res.events))
      .catch(() => setError(true))
  }

  useEffect(refresh, [])

  // After an optional "sign in with Google" round-trip from the signup
  // modal, the OAuth callback lands back here with ?signup=<eventId> —
  // reopen that event's signup modal (now with the account's name/email
  // prefilled) instead of dropping the visitor back at a bare event list.
  useEffect(() => {
    if (!events) return
    const params = new URLSearchParams(window.location.search)
    const signupId = params.get('signup')
    if (!signupId) return
    const match = events.find((e) => e.id === Number(signupId))
    if (match) setSignupEvent(match)
    params.delete('signup')
    const rest = params.toString()
    window.history.replaceState(null, '', rest ? `?${rest}` : window.location.pathname)
  }, [events])

  function openSignup(e: PublicClubEvent) {
    setDetailEvent(null)
    setSignupEvent(e)
  }

  function openManage(e: PublicClubEvent, signupId: number, status: SignupStatus | null) {
    setDetailEvent(null)
    setManage({ event: e, signupId, status })
  }

  const groups = new Map<string, PublicClubEvent[]>()
  for (const event of events ?? []) {
    const dayKey = event.start_time.slice(0, 10)
    if (!groups.has(dayKey)) groups.set(dayKey, [])
    groups.get(dayKey)!.push(event)
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
                      onOpenDetail={setDetailEvent}
                      onOpenSignup={setSignupEvent}
                      onManageSignup={(e, signupId, status) => setManage({ event: e, signupId, status })}
                    />
                  ))}
                </div>
              </div>
            ))}
          </>
        )}

        {detailEvent && (
          <EventDetailModal
            event={detailEvent}
            onClose={() => setDetailEvent(null)}
            onOpenSignup={openSignup}
            onManageSignup={openManage}
          />
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
