import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import SignupModal from '../components/SignupModal'
import EventTeams from '../components/EventTeams'
import EventScores from '../components/EventScores'
import { WAIVER_URL } from '../constants'
import { ApiError, getEvent } from '../lib/api'
import {
  directionsUrl,
  EVENT_TYPE_LABELS,
  formatEventDate,
  formatSignupDeadline,
  formatTimeRange,
  getSignupState,
} from '../lib/eventFormat'
import { renderMarkdown } from '../lib/markdown'
import type { PublicClubEvent, SignupStatus } from '../types'

// Public page for one event at /events/:eventId — replaces the old
// EventDetailModal. The Events list links here instead of opening a dialog,
// so an event is shareable and back-button friendly. Teams / bracket / score
// tabs land in later PRs; for now the page is just the detail view, and a
// tab strip only appears once there's more than one tab.
function EventDetail() {
  const { eventId } = useParams<{ eventId: string }>()
  const id = Number(eventId)
  const [searchParams, setSearchParams] = useSearchParams()

  const [event, setEvent] = useState<PublicClubEvent | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'notfound' | 'error'>('loading')
  const [signupOpen, setSignupOpen] = useState(false)
  const [manage, setManage] = useState<{ signupId: number; status: SignupStatus | null } | null>(null)

  function refresh() {
    if (!Number.isInteger(id)) {
      setState('notfound')
      return
    }
    getEvent(id)
      .then((res) => {
        setEvent(res.event)
        setState('ready')
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 404) {
          setState('notfound')
          return
        }
        console.error('Failed to load event', err)
        setState('error')
      })
  }

  useEffect(refresh, [id])

  // After an optional "sign in with Google/Microsoft" round-trip from the
  // signup modal, the OAuth callback lands back here with ?signup=<eventId>.
  // Reopen the modal — into the "manage" view if the now-authenticated
  // account turns out to already have a signup on this event, otherwise the
  // fresh signup form.
  useEffect(() => {
    if (state !== 'ready') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('signup') !== String(id)) return
    const e = event as PublicClubEvent
    if (e.my_signup_id) {
      setManage({ signupId: e.my_signup_id, status: e.my_signup_status })
    } else {
      setSignupOpen(true)
    }
    params.delete('signup')
    const rest = params.toString()
    window.history.replaceState(null, '', rest ? `?${rest}` : window.location.pathname)
  }, [state, id, event])

  if (state === 'loading') {
    return (
      <main id="main-content" tabIndex={-1}>
        <div className="board event-page">
          <p className="placeholder-note">Loading&hellip;</p>
        </div>
      </main>
    )
  }

  if (state === 'notfound' || state === 'error') {
    return (
      <main id="main-content" tabIndex={-1}>
        <div className="board event-page">
          <Link className="event-page-back" to="/events">
            &larr; All events
          </Link>
          <h1>{state === 'notfound' ? 'Event not found' : "Couldn't load this event"}</h1>
          <p className="placeholder-note">
            {state === 'notfound'
              ? 'This event may have been removed, or the link is wrong.'
              : 'Try refreshing, or check our GroupMe below.'}
          </p>
        </div>
      </main>
    )
  }

  const e = event as PublicClubEvent
  const { spotsLeft, isFull, joinsWaitlist, deadlinePassed, verb } = getSignupState(e)
  const tags = e.tags ? e.tags.split(',').map((t) => t.trim()).filter(Boolean) : []
  const isCancelled = e.status === 'cancelled'
  const teams = e.teams ?? []
  const matches = e.matches ?? []
  const standings = e.standings ?? []
  const timedOnly = Boolean(e.schedule_config?.timed_only)
  const hasScores = matches.length > 0
  const scoresLabel = timedOnly ? 'Schedule' : 'Scores'
  type PageTab = 'details' | 'teams' | 'scores'
  const requested = searchParams.get('tab')
  const tab: PageTab =
    requested === 'teams' && teams.length > 0
      ? 'teams'
      : requested === 'scores' && hasScores
        ? 'scores'
        : 'details'
  const setTab = (next: PageTab) =>
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        if (next === 'details') p.delete('tab')
        else p.set('tab', next)
        return p
      },
      { replace: true }
    )

  return (
    <main id="main-content" tabIndex={-1}>
      <div className="board event-page">
        <Link className="event-page-back" to="/events">
          &larr; All events
        </Link>

        <p className="event-page-eyebrow">
          {EVENT_TYPE_LABELS[e.event_type] ?? e.event_type}
          {isCancelled && <span className="event-page-cancelled-tag">Cancelled</span>}
        </p>
        <h1>{e.title}</h1>

        <div className="event-page-meta">
          <div>{formatEventDate(e.start_time)}</div>
          <div>{formatTimeRange(e)}</div>
          {e.location_name && (
            <div>
              {e.location_name}
              {e.location_address && (
                <>
                  {' · '}
                  <a
                    href={directionsUrl(e.location_address)}
                    target="_blank"
                    rel="noreferrer"
                    className="directions-link"
                  >
                    Directions
                  </a>
                </>
              )}
            </div>
          )}
        </div>

        {tags.length > 0 && (
          <div className="event-card-tags event-page-tags">
            {tags.map((t) => (
              <span className="tag-chip" key={t}>
                {t}
              </span>
            ))}
          </div>
        )}

        {(teams.length > 0 || hasScores) && (
          <div className="event-page-tabbar" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'details'}
              className={tab === 'details' ? 'active' : undefined}
              onClick={() => setTab('details')}
            >
              Details
            </button>
            {teams.length > 0 && (
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'teams'}
                className={tab === 'teams' ? 'active' : undefined}
                onClick={() => setTab('teams')}
              >
                Teams <span className="event-tab-count">{teams.length}</span>
              </button>
            )}
            {hasScores && (
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'scores'}
                className={tab === 'scores' ? 'active' : undefined}
                onClick={() => setTab('scores')}
              >
                {scoresLabel}
              </button>
            )}
          </div>
        )}

        {tab === 'teams' ? (
          <EventTeams teams={teams} />
        ) : tab === 'scores' ? (
          <EventScores matches={matches} standings={standings} timedOnly={timedOnly} />
        ) : (
          <>
        {isCancelled && <p className="event-card-desc">This event has been cancelled.</p>}
        {!isCancelled && e.description && (
          <div className="event-detail-desc event-page-desc">{renderMarkdown(e.description)}</div>
        )}

        {!isCancelled && e.signup_enabled && (
          <div className="event-card-signup event-page-signup">
            <span className="event-card-signup-status">
              <b>{e.signup_count}</b> {verb === 'RSVP' ? 'going' : 'signed up'}
              {spotsLeft !== null && !isFull && <span className="cap-chip">{spotsLeft} left</span>}
              {isFull && !joinsWaitlist && <span className="full-chip">full</span>}
              {joinsWaitlist && <span className="cap-chip">waitlist open</span>}
            </span>
            {e.my_signup_id ? (
              <button
                className="btn btn-outline"
                type="button"
                onClick={() => setManage({ signupId: e.my_signup_id as number, status: e.my_signup_status })}
              >
                {e.my_signup_status === 'pending'
                  ? 'Request pending · Manage'
                  : e.my_signup_status === 'denied'
                    ? 'Not approved · Manage'
                    : e.my_signup_status === 'waitlist'
                      ? 'On waitlist · Manage'
                      : "You’re going · Manage"}
              </button>
            ) : (
              <button
                className={isFull && !joinsWaitlist ? 'btn btn-outline' : 'btn btn-ace'}
                type="button"
                disabled={deadlinePassed || (isFull && !joinsWaitlist)}
                onClick={() => setSignupOpen(true)}
              >
                {deadlinePassed
                  ? 'Deadline for registration passed'
                  : joinsWaitlist
                    ? 'Join waitlist'
                    : isFull
                      ? 'Full'
                      : verb}
              </button>
            )}
          </div>
        )}

        {!isCancelled && e.signup_enabled && !e.my_signup_id && !deadlinePassed && e.signup_deadline && (
          <p className="event-card-deadline">Signup closes {formatSignupDeadline(e.signup_deadline)}</p>
        )}

        {!isCancelled && e.signup_enabled && (
          <p className="waiver-download-note">
            Playing requires a signed liability waiver &mdash;{' '}
            <a href={WAIVER_URL} target="_blank" rel="noreferrer">
              download and print it
            </a>{' '}
            ahead of time.
          </p>
        )}
          </>
        )}
      </div>

      {signupOpen && (
        <SignupModal
          event={e}
          onClose={() => {
            setSignupOpen(false)
            refresh()
          }}
        />
      )}
      {manage && (
        <SignupModal
          event={e}
          existingSignupId={manage.signupId}
          existingSignupStatus={manage.status}
          onCancelled={refresh}
          onClose={() => {
            setManage(null)
            refresh()
          }}
        />
      )}
    </main>
  )
}

export default EventDetail
