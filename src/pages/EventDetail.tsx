import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import SignupModal from '../components/SignupModal'
import EventTeams from '../components/EventTeams'
import EventScores from '../components/EventScores'
import EventBracket from '../components/EventBracket'
import EventPools from '../components/EventPools'
import {
  AlertIcon,
  BracketIcon,
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  PinIcon,
  ShareIcon,
  UsersIcon,
} from '../components/EventIcons'
import { WAIVER_URL } from '../constants'
import { ApiError, getEvent } from '../lib/api'
import { downloadEventIcs } from '../lib/calendar'
import {
  directionsUrl,
  EVENT_TYPE_LABELS,
  formatEventDate,
  formatSignupDeadline,
  formatTimeRange,
  getSignupState,
  playFormatLabel,
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
  const [shareNote, setShareNote] = useState<string | null>(null)

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
  const pools = e.pools ?? []
  const isPool = pools.length > 0
  const bracketStarted = matches.some((m) => m.bracket === 'winners')
  const timedOnly = Boolean(e.schedule_config?.timed_only)
  const hasScores = isPool ? bracketStarted : matches.length > 0
  const isBracket = isPool ? bracketStarted : matches.some((m) => m.bracket !== 'pool')
  const scoresLabel = isBracket ? 'Bracket' : timedOnly ? 'Schedule' : 'Scores'
  type PageTab = 'details' | 'teams' | 'pools' | 'scores'
  const requested = searchParams.get('tab')
  const tab: PageTab =
    requested === 'teams' && teams.length > 0
      ? 'teams'
      : requested === 'pools' && isPool
        ? 'pools'
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

  const spotsCopy =
    e.capacity !== null
      ? isFull
        ? joinsWaitlist
          ? `${e.signup_count} signed up · waitlist open`
          : 'Full'
        : `${e.signup_count} of ${e.capacity} spots filled${spotsLeft !== null ? ` · ${spotsLeft} left` : ''}`
      : `${e.signup_count} ${verb === 'RSVP' ? 'going' : 'signed up'}`
  const meterPct =
    e.capacity && e.capacity > 0 ? Math.min(100, Math.round((e.signup_count / e.capacity) * 100)) : null
  const formatLabel = playFormatLabel(e.play_format)
  const myStatusClass =
    e.my_signup_status === 'waitlist'
      ? 'is-waitlist'
      : e.my_signup_status === 'denied'
        ? 'is-denied'
        : e.my_signup_status === 'pending'
          ? 'is-pending'
          : e.my_signup_id
            ? 'is-going'
            : ''

  async function handleShare() {
    const url = window.location.href
    if (navigator.share) {
      try {
        await navigator.share({ title: e.title, url })
        return
      } catch {
        // user cancelled the share sheet — fall through to nothing
        return
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      setShareNote('Link copied')
      window.setTimeout(() => setShareNote(null), 2000)
    } catch (err) {
      console.error('Share failed', err)
    }
  }

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

        {tags.length > 0 && (
          <div className="event-card-tags event-page-tags">
            {tags.map((t) => (
              <span className="tag-chip" key={t}>
                {t}
              </span>
            ))}
          </div>
        )}

        <dl className="event-glance">
          <div className="event-glance-row">
            <CalendarIcon className="event-glance-icon" />
            <div>
              <dt>Date</dt>
              <dd>{formatEventDate(e.start_time)}</dd>
            </div>
          </div>
          <div className="event-glance-row">
            <ClockIcon className="event-glance-icon" />
            <div>
              <dt>Time</dt>
              <dd>{formatTimeRange(e)}</dd>
            </div>
          </div>
          {e.location_name && (
            <div className="event-glance-row">
              <PinIcon className="event-glance-icon" />
              <div>
                <dt>Location</dt>
                <dd>
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
                </dd>
              </div>
            </div>
          )}
          {formatLabel && (
            <div className="event-glance-row">
              <BracketIcon className="event-glance-icon" />
              <div>
                <dt>Format</dt>
                <dd>{formatLabel}</dd>
              </div>
            </div>
          )}
          {!isCancelled && e.signup_enabled && (
            <div className="event-glance-row">
              <UsersIcon className="event-glance-icon" />
              <div>
                <dt>{verb === 'RSVP' ? 'Attendance' : 'Spots'}</dt>
                <dd>{spotsCopy}</dd>
                {meterPct !== null && (
                  <div className="event-meter" aria-hidden="true">
                    <i style={{ width: `${meterPct}%` }} />
                  </div>
                )}
              </div>
            </div>
          )}
        </dl>

        {!isCancelled && (
          <div className="event-aux-actions">
            <button className="btn btn-outline btn-sm" type="button" onClick={() => downloadEventIcs(e)}>
              <CalendarIcon /> Add to calendar
            </button>
            <button className="btn btn-outline btn-sm" type="button" onClick={handleShare}>
              <ShareIcon /> {shareNote ?? 'Share'}
            </button>
          </div>
        )}

        {(teams.length > 0 || hasScores || isPool) && (
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
            {isPool && (
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'pools'}
                className={tab === 'pools' ? 'active' : undefined}
                onClick={() => setTab('pools')}
              >
                Pools <span className="event-tab-count">{pools.length}</span>
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
        ) : tab === 'pools' ? (
          <EventPools pools={pools} matches={matches} />
        ) : tab === 'scores' ? (
          isBracket ? (
            <EventBracket matches={matches} />
          ) : (
            <EventScores matches={matches} standings={standings} timedOnly={timedOnly} />
          )
        ) : (
          <div className="event-page-details">
        {isCancelled && <p className="event-page-cancelled-msg">This event has been cancelled.</p>}
        {!isCancelled && e.description && (
          <div className="event-detail-desc event-page-desc">{renderMarkdown(e.description)}</div>
        )}

        {!isCancelled && e.signup_enabled && (
          <div className={`event-signup-card${myStatusClass ? ` ${myStatusClass}` : ''}`}>
            {e.my_signup_id ? (
              <>
                <p className={`event-signup-state${myStatusClass ? ` ${myStatusClass}` : ''}`}>
                  {e.my_signup_status === 'approved' || e.my_signup_status === null ? (
                    <CheckIcon />
                  ) : e.my_signup_status === 'denied' ? (
                    <AlertIcon />
                  ) : (
                    <ClockIcon />
                  )}
                  {e.my_signup_status === 'pending'
                    ? 'Request pending'
                    : e.my_signup_status === 'denied'
                      ? 'Not approved'
                      : e.my_signup_status === 'waitlist'
                        ? 'On the waitlist'
                        : "You’re going"}
                </p>
                <button
                  className="btn btn-outline"
                  type="button"
                  onClick={() => setManage({ signupId: e.my_signup_id as number, status: e.my_signup_status })}
                >
                  Manage signup
                </button>
              </>
            ) : (
              <>
                <div className="event-signup-card-top">
                  <span className="event-signup-count">
                    <b>{e.signup_count}</b> {verb === 'RSVP' ? 'going' : 'signed up'}
                  </span>
                  {spotsLeft !== null && !isFull && <span className="cap-chip">{spotsLeft} left</span>}
                  {isFull && !joinsWaitlist && <span className="full-chip">full</span>}
                  {joinsWaitlist && <span className="cap-chip">waitlist open</span>}
                </div>
                {meterPct !== null && (
                  <div className="event-meter" aria-hidden="true">
                    <i style={{ width: `${meterPct}%` }} />
                  </div>
                )}
                <button
                  className={`btn ${isFull && !joinsWaitlist ? 'btn-outline' : 'btn-ace'} event-signup-btn`}
                  type="button"
                  disabled={deadlinePassed || (isFull && !joinsWaitlist)}
                  onClick={() => setSignupOpen(true)}
                >
                  {deadlinePassed
                    ? 'Registration closed'
                    : joinsWaitlist
                      ? 'Join waitlist'
                      : isFull
                        ? 'Full'
                        : verb}
                </button>
                {!deadlinePassed && e.signup_deadline && (
                  <p className="event-signup-deadline">
                    Signup closes {formatSignupDeadline(e.signup_deadline)}
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {!isCancelled && e.signup_enabled && (
          <div className="event-waiver-callout">
            <AlertIcon className="event-waiver-icon" />
            <p>
              Playing requires a signed liability waiver.{' '}
              <a href={WAIVER_URL} target="_blank" rel="noreferrer">
                Download and print it
              </a>{' '}
              ahead of time and bring it with you.
            </p>
          </div>
        )}
          </div>
        )}
      </div>

      {!isCancelled && e.signup_enabled && !e.my_signup_id && tab === 'details' && (
        <div className="event-signup-bar">
          <span className="event-signup-bar-status">
            {isFull && !joinsWaitlist ? 'Event full' : spotsCopy}
          </span>
          <button
            className={`btn ${isFull && !joinsWaitlist ? 'btn-outline' : 'btn-ace'}`}
            type="button"
            disabled={deadlinePassed || (isFull && !joinsWaitlist)}
            onClick={() => setSignupOpen(true)}
          >
            {deadlinePassed ? 'Closed' : joinsWaitlist ? 'Join waitlist' : isFull ? 'Full' : verb}
          </button>
        </div>
      )}
      {!isCancelled && e.signup_enabled && e.my_signup_id && tab === 'details' && (
        <div className="event-signup-bar">
          <span className="event-signup-bar-status">
            {e.my_signup_status === 'pending'
              ? 'Request pending'
              : e.my_signup_status === 'waitlist'
                ? 'On the waitlist'
                : e.my_signup_status === 'denied'
                  ? 'Not approved'
                  : "You’re going"}
          </span>
          <button
            className="btn btn-outline"
            type="button"
            onClick={() => setManage({ signupId: e.my_signup_id as number, status: e.my_signup_status })}
          >
            Manage
          </button>
        </div>
      )}

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
